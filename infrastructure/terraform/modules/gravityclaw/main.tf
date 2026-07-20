variable "app_name" { type = string }
variable "environment" { type = string }
variable "vpc_cidr" { type = string }
variable "public_subnets" { type = list(string) }
variable "private_subnets" { type = list(string) }
variable "app_cpu" { type = number }
variable "app_memory" { type = number }
variable "min_capacity" { type = number }
variable "max_capacity" { type = number }
variable "desired_capacity" { type = number }
variable "redis_node_type" { type = string }
variable "attachment_bucket" { type = string }
variable "alarm_email" { type = string }
variable "enable_dashboard" { type = bool }

resource "aws_vpc" "main" {
  cidr_block = var.vpc_cidr
  tags = { Name = "${var.app_name}-${var.environment}" }
}

resource "aws_ecs_cluster" "main" {
  name = "${var.app_name}-${var.environment}"
}

resource "aws_ecs_task_definition" "app" {
  family                   = "${var.app_name}-${var.environment}"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.app_cpu
  memory                   = var.app_memory

  container_definitions = jsonencode([
    {
      name  = "app"
      image = "registry.gravityclaw.io/gravityclaw:latest"
      portMappings = [{ containerPort = 3000 }]
      environment = [
        { name = "NODE_ENV", value = "production" },
        { name = "REDIS_URL", value = "redis://${aws_elasticache_cluster.redis.cache_nodes[0].address}:6379" }
      ]
      healthCheck = {
        command = ["CMD", "node", "-e", "fetch('http://localhost:3000/api/live').then(r=>process.exit(r.ok?0:1))"]
        interval = 15
        timeout  = 5
        retries  = 3
      }
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = "/ecs/${var.app_name}"
          "awslogs-region"        = "us-east-1"
          "awslogs-stream-prefix" = "app"
        }
      }
    }
  ])
}

resource "aws_ecs_service" "app" {
  name            = "${var.app_name}-${var.environment}"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = var.desired_capacity
  launch_type     = "FARGATE"

  network_configuration {
    subnets         = var.private_subnets
    security_groups = [aws_security_group.app.id]
  }

  deployment_controller {
    type = "ECS"
  }
}

resource "aws_elasticache_cluster" "redis" {
  cluster_id      = "${var.app_name}-${var.environment}"
  engine          = "redis"
  node_type       = var.redis_node_type
  num_cache_nodes = 1
  subnet_group_name = aws_elasticache_subnet_group.main.name
}

resource "aws_elasticache_subnet_group" "main" {
  name       = "${var.app_name}-${var.environment}"
  subnet_ids = var.private_subnets
}

resource "aws_security_group" "app" {
  vpc_id = aws_vpc.main.id
}

resource "aws_s3_bucket" "attachments" {
  bucket = var.attachment_bucket
}

output "alb_dns" {
  value = aws_alb.main.dns_name
}

output "redis_endpoint" {
  value = aws_elasticache_cluster.redis.cache_nodes[0].address
}

output "attachment_bucket" {
  value = aws_s3_bucket.attachments.id
}
