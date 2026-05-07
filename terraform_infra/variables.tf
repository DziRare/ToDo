variable "aws_region" {
  description = "AWS region to deploy into."
  type        = string
  default     = "ap-southeast-2"
}

variable "project_name" {
  description = "Name prefix used for created resources."
  type        = string
  default     = "TodoInfra"
}

variable "api_source_path" {
  description = <<-EOT
    Path to the Python Lambda source directory, relative to this Terraform
    root. Must contain todo.py with a `handler` function.
  EOT
  type        = string
  default     = "../api"
}

variable "tags" {
  description = "Tags applied to taggable resources."
  type        = map(string)
  default = {
    Project   = "todo-infra"
    ManagedBy = "Terraform"
  }
}
