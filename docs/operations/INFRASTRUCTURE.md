# Infrastructure as Code (Terraform)

The `infrastructure/terraform/` directory contains all the modules required to provision the infrastructure for GravityClaw on AWS or a generic VPS.

## Prerequisites
- [Terraform](https://developer.hashicorp.com/terraform/downloads) >= 1.5.0
- AWS CLI configured with administrator credentials (if deploying to AWS)

## Module Overview

The `gravityclaw` module (`infrastructure/terraform/modules/gravityclaw/main.tf`) provisions the following resources:
- A compute instance (EC2 or generic equivalent)
- Security Groups for SSH (port 22) and HTTPS (port 443)
- An EBS volume for persistent SQLite database storage

## Usage

1. Navigate to the terraform directory:
   ```bash
   cd infrastructure/terraform
   ```
2. Initialize Terraform to download providers:
   ```bash
   terraform init
   ```
3. Plan your changes (you may need to provide variables in a `terraform.tfvars` file):
   ```bash
   terraform plan -out=tfplan
   ```
4. Apply the changes:
   ```bash
   terraform apply tfplan
   ```

## Variables
The `variables.tf` file expects the following key parameters:
- `instance_type`: The compute tier (default: `t3.micro`).
- `region`: The AWS region (default: `us-east-1`).
- `allowed_ips`: A list of CIDR blocks allowed to access the SSH port.

## Outputs
After a successful apply, the `outputs.tf` file will yield:
- `public_ip`: The public IP address of the provisioned server.
- `database_volume_id`: The ID of the attached block storage volume.
