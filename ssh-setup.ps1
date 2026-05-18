# GravityClaw SSH Setup Script
# Run in PowerShell as Administrator

Write-Host "=== 1. Enable SSH Server ===" -ForegroundColor Cyan
Get-WindowsOptionalFeature -Online -FeatureName OpenSSH.Server
Enable-WindowsOptionalFeature -Online -FeatureName OpenSSH.Server -NoRestart

Write-Host "`n=== 2. Install WSL with Ubuntu (for tmux/mosh) ===" -ForegroundColor Cyan
wsl --install -d Ubuntu

Write-Host "`n=== 3. After WSL install, inside Ubuntu run: ===" -ForegroundColor Yellow
@"
sudo apt update
sudo apt install -y tmux mosh ntfy
ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub >> ~/.ssh/authorized_keys

# Create persistent tmux session
tmux new-session -d -s claude
tmux send-keys -t claude:0 'claude' Enter
"@

Write-Host "`n=== 4. Start SSH service ===" -ForegroundColor Cyan
Start-Service sshd

Write-Host "`n=== 5. Get your IP ===" -ForegroundColor Cyan
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notlike '*Loopback*' } | Select-Object IPAddress