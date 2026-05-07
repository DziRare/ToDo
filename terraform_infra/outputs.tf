###############################################################################
# Outputs — equivalent to the CDK CfnOutputs
###############################################################################

output "todo_site_url" {
  description = "Public URL of the static website (S3 website endpoint)."
  value       = "http://${aws_s3_bucket_website_configuration.website.website_endpoint}"
}

output "api_url" {
  description = "Public Lambda Function URL for the API."
  value       = aws_lambda_function_url.api.function_url
}

output "table_name" {
  description = "DynamoDB table name."
  value       = aws_dynamodb_table.tasks.name
}

output "bucket_name" {
  description = "S3 bucket hosting the static site."
  value       = aws_s3_bucket.website.id
}
