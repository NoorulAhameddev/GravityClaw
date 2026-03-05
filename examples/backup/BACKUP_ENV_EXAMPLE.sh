#!/usr/bin/env bash
# Gravity Claw Backup & Restore System - Configuration Example
# Copy this section to your .env file to configure backups

# ============================================================================
# BACKUP & RESTORE CONFIGURATION
# ============================================================================

# Enable automatic backup scheduler (default: true)
# Set to false to disable automatic backups (on-demand only)
BACKUP_ENABLED=true

# Cron expression for backup schedule (default: daily at 2 AM)
# Format: "minute hour day-of-month month day-of-week"
# Examples:
#   "0 2 * * *"      # Daily at 2 AM (default)
#   "0 2 * * 0"      # Every Sunday at 2 AM
#   "0 */6 * * *"    # Every 6 hours
#   "0 0 * * *"      # Daily at midnight
#   "0 0 1 * *"      # Monthly on the 1st
#   "0 3 * * *"      # Daily at 3 AM
BACKUP_CRON="0 2 * * *"

# Number of days to retain backups (default: 30)
# Backups older than this are automatically deleted
# Set to 7 for weekly backups, 365 for yearly archival
BACKUP_RETENTION_DAYS=30

# Enable AES-256-GCM encryption of backup files (default: true)
# High security: encrypted with master key
# Set to false to disable encryption (NOT RECOMMENDED)
BACKUP_ENCRYPT=true

# Enable gzip compression of backup files (default: true)
# Reduces storage footprint by 3-10x depending on data
# Set to false to store uncompressed (uses more disk space)
BACKUP_COMPRESS=true

# Directory to store backups (default: ./backups)
# Can be absolute or relative path
# Examples:
#   "./backups"                      # Relative to project root
#   "/var/backups/gravity-claw"      # Absolute path on Linux/Mac
#   "C:\\backups\\gravity-claw"      # Absolute path on Windows
#   "/mnt/external-drive/backups"    # External storage
BACKUP_DIR=./backups

# Master encryption key for backup encryption
# If not set, uses MASTER_KEY environment variable
# Generate a secure key:
#   openssl rand -hex 32
# Result will be a 64-character hex string
# NEVER commit this to version control!
# Example: a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6789012345
BACKUP_MASTER_KEY=your-secret-encryption-key-here

# ============================================================================
# NOTES
# ============================================================================
# - All backup files are stored in the BACKUP_DIR
# - Backup directory is in .gitignore (won't be committed)
# - Encryption uses AES-256-GCM (NIST-approved algorithm)
# - Verify backups regularly with: get_backup_status, verify_backup tools
# - For production, store BACKUP_MASTER_KEY in secure vault (AWS Secrets, HashiCorp Vault, etc.)
# - Test restore process in development environment monthly
# - Monitor storage usage: get_backup_status shows total storage used
