output "api_url" {
  description = "Public Lambda Function URL for the API."
  value       = aws_lambda_function_url.api.function_url
}

output "table_name" {
  description = "DynamoDB table name."
  value       = aws_dynamodb_table.tasks.name
}
