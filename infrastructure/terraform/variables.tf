variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "production"
}

variable "alarm_email" {
  description = "Email for CloudWatch alarms"
  type        = string
  default     = "ops@gravityclaw.dev"
}
