# ToDo

A serverless CRUD todo list on AWS — FastAPI on Lambda, DynamoDB for data storage, a static site on S3, all provisioned with Terraform.

## Architecture

```
             ┌─────────────┐
     |-------│   Browser   │------|
     |       └─────────────┘      |
     │                            │
     │ 1.                         │ 2.
     │ GET                        │ HTTPS
     │ HTML                       │ JSON
     │ +JS                        │ /tasks
     │ +CSS                       │
     │                            │
  ═══╪════════════════════════════╪═══════════════════════════════════════════ AWS (ap-southeast-2)
     ▼                            ▼
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│  S3              │    │  Lambda          │    │  DynamoDB        │
│  Static website  │    │  Python 3.9      │───▶│  Tasks Table     │
│  HTML, JS, CSS   │    │  FastAPI         │    │                  │
│                  │    │  Function URL    │    │                  │
│                  │    │                  │    │                  │
└──────────────────┘    └──────────────────┘    └──────────────────┘
```

Three AWS services, glued together by Terraform:

- **DynamoDB** — single table keyed on `task_id`, with a GSI on `user_id` so the API can list a user's tasks. Items expire after 24 hours via a `ttl` attribute.
- **Lambda** — the API. FastAPI app wrapped with [Mangum](https://mangum.io/) to bridge API-Gateway-style events into ASGI. Function URL gives it a public HTTPS endpoint without needing API Gateway.
- **S3** — hosts the static frontend (plain HTML/CSS/JS, no build step).

## Repository layout

```
ToDo/
├── api/                          Lambda source
│   ├── todo.py                   FastAPI app + Mangum handler
│   ├── requirements.txt
│   ├── package_for_lambda.sh     Builds lambda_function.zip
│   └── lambda_function.zip       Pre-built deployment package
├── todo-site/                    Static frontend
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   └── config.js                 API_URL lives here
├── terraform_infra/              Infrastructure-as-code
│   ├── providers.tf
│   ├── variables.tf
│   ├── main.tf                   DDB + Lambda + Function URL
│   ├── s3.tf                     Bucket + site upload
│   └── outputs.tf
├── test/
│   └── api_integration_test.py
└── README.md
```

## Prerequisites

- Terraform `>= 1.5.0`
- AWS CLI, configured with credentials (`aws configure`) for an account and region you can deploy to. The repo currently targets `ap-southeast-2`.
- Python 3.9+ if you plan to rebuild the Lambda zip.

## Deploy

From `terraform_infra/`:

```bash
terraform init
terraform plan
terraform apply
```

First-time apply takes ~30 seconds. Two outputs you'll want:

```bash
terraform output api_url          # Lambda Function URL
terraform output todo_site_url    # Public S3 website URL
```

### Wire the frontend to the API

After the first apply, copy the `api_url` output into `todo-site/config.js`:

```js
window.APP_CONFIG = {
  API_URL: "https://...lambda-url.ap-southeast-2.on.aws",
};
```

Then re-run `terraform apply` — the file's MD5 changes, Terraform re-uploads it, and the site is live.

### Updating

- **Frontend changes** — edit anything in `todo-site/` and run `terraform apply`. Files are re-uploaded based on their MD5 etag.
- **API changes** — edit `api/todo.py`, then rebuild the deployment package:
  ```bash
  cd api
  ./package_for_lambda.sh
  cd ../terraform_infra
  terraform apply
  ```
  Terraform sees the zip's hash changed and pushes the new code.
- **Schema changes (DDB)** — be careful. Renaming `hash_key` forces a table replace, which destroys data. Plan first, always.

## API reference

All routes are served from the Lambda Function URL. The base URL is whatever `terraform output api_url` returns.

### `GET /`

Health check. Returns `{"message": "Hello World from Todo API"}`.

### `PUT /create-task`

Creates a task. Server generates `task_id` (`task_<uuid hex>`), `created_time`, and `ttl` (24 hours from creation).

Request body:

```json
{
  "user_id": "user_abc123",
  "content": "Buy milk"
}
```

Response: `{"task": {<full item>}}`

### `GET /get-task/{task_id}`

Returns a single task by id, or 404.

Response:

```json
{
  "task_id": "task_...",
  "user_id": "user_abc123",
  "content": "Buy milk",
  "is_done": false,
  "created_time": 1746609412,
  "ttl": 1746695812
}
```

### `GET /list-tasks/{user_id}`

Returns up to 10 most recent tasks for a user, newest first. Uses the `user-index` GSI.

Response: `{"tasks": [<item>, <item>, ...]}`

### `PUT /update-task`

Updates a task's content and/or done state. All three body fields are required — the API does a `SET` on both `content` and `is_done`, so partial updates aren't supported.

Request body:

```json
{
  "task_id": "task_...",
  "content": "Buy oat milk",
  "is_done": true
}
```

Response: `{"updated_task_id": "task_..."}`

### `DELETE /delete-task/{task_id}`

Deletes a task. Idempotent — succeeds even if the task doesn't exist.

Response: `{"deleted_task_id": "task_..."}`

## Notes & caveats

- **TTL is set to 24 hours.** Tasks vanish after a day. Adjust the `+ 86400` in `todo.py` if you want longer retention.
- **No authentication.** Function URL is `authType: NONE` and the bucket policy is public-read. Fine for a demo or internal tool, not fine for production. Add Cognito or IAM auth before exposing this anywhere serious.
- **CORS is wide open** (`*` origins, methods, headers) on the Function URL. Tighten this if you have a known frontend domain.
- **The deprecation warning on `hash_key`/`range_key`** in the AWS provider is a known issue — the proposed `key_schema` replacement has worse bugs, so the provider team's current guidance is to ignore it.

The bucket has `force_destroy = true` so it'll be emptied before deletion. DynamoDB items are deleted with the table.
