provider "aws" {
  region = var.aws_region
}

module "gravityclaw" {
  source = "./modules/gravityclaw"

  app_name    = "gravityclaw"
  environment = var.environment

  vpc_cidr          = "10.0.0.0/16"
  public_subnets    = ["10.0.1.0/24", "10.0.2.0/24"]
  private_subnets   = ["10.0.10.0/24", "10.0.11.0/24"]

  app_cpu           = 1024
  app_memory        = 2048
  min_capacity      = 2
  max_capacity      = 20
  desired_capacity  = 2

  redis_node_type   = "cache.t3.small"

  attachment_bucket = "gravityclaw-attachments-${var.environment}"

  alarm_email       = var.alarm_email
  enable_dashboard  = true
}
