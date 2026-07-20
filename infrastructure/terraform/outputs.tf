output "alb_dns" {
  description = "ALB DNS name"
  value       = module.gravityclaw.alb_dns
}

output "redis_endpoint" {
  description = "Redis endpoint"
  value       = module.gravityclaw.redis_endpoint
}

output "s3_bucket" {
  description = "S3 bucket for attachments"
  value       = module.gravityclaw.attachment_bucket
}
