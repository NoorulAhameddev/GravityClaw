# Remote Claude Code Access Setup Plan

**Goal:** Set up secure remote access to Claude Code on Windows 11 via Tailscale VPN with WSL2 Ubuntu, MOSH, and tmux.

**Architecture:** Layered approach - Tailscale provides encrypted overlay network, Windows OpenSSH allows remote login, WSL2 hosts the development environment with tmux for session persistence.

**Tech Stack:** Windows 11, WSL2 Ubuntu 22.04, Tailscale, OpenSSH, tmux, mosh, ntfy, Claude Code CLI

---

## Phase 1: WSL2 Ubuntu Setup

### Task 1: Enable WSL2 and Install Ubuntu

- [ ] **Step 1: Enable WSL2 and Virtual Machine Platform**

```powershell
# Run as Administrator in PowerShell
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart
wsl --set-default-version 2
```

- [ ] **Step 2: Install Ubuntu 22.04 LTS**

```powershell
wsl --install -d Ubuntu-22.04
```

- [ ] **Step 3: Create user and update packages**

```bash
# In WSL Ubuntu
sudo apt update && sudo apt upgrade -y
sudo adduser noorul
sudo usermod -aG sudo noorul
```

---

## Phase 2: Tailscale Setup

### Task 2: Install and Configure Tailscale on Windows

- [ ] **Step 1: Download and install Tailscale for Windows**

```powershell
# Run as Administrator
winget install tailscale.tailscale
```

- [ ] **Step 2: Start Tailscale and authenticate**

```powershell
Start-Process -FilePath "Tailscale" -ArgumentString "up"
# Or use: tailscale up --operator=noorul
```

- [ ] **Step 3: Enable auto-start**

```powershell
Set-ItemProperty -Path "HKLM:\SOFTWARE\Tailscale IPN" -Name "UnattendedMode" -Value "always"
```

- [ ] **Step 4: Get Tailscale IP**

```powershell
tailscale ip -4
```

### Task 3: Install Tailscale in WSL

- [ ] **Step 1: Add Tailscale apt repository and install**

```bash
# In WSL Ubuntu
curl -fsSL https://tailscale.com/install.sh | sh
```

- [ ] **Step 2: Connect to Tailscale network**

```bash
# In WSL Ubuntu
sudo tailscale up --operator=noorul --accept-routes
```

- [ ] **Step 3: Verify connection**

```bash
tailscale status
tailscale ip -4
```

---

## Phase 3: Windows OpenSSH Server

### Task 4: Configure OpenSSH Server on Windows

- [ ] **Step 1: Install OpenSSH Server**

```powershell
# Run as Administrator
Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
```

- [ ] **Step 2: Configure SSH service to start automatically**

```powershell
Set-Service -Name sshd -StartupType Automatic
Start-Service sshd
```

- [ ] **Step 3: Configure key-based authentication**

```powershell
# Create .ssh directory for noorul
New-Item -ItemType Directory -Path "C:\Users\Noorul_Ahamed\.ssh" -Force

# Edit sshd_config to disable password auth
notepad C:\ProgramData\ssh\sshd_config
```

Add these lines to sshd_config:
```
PasswordAuthentication no
PubkeyAuthentication yes
PermitRootLogin no
```

- [ ] **Step 4: Configure Windows Firewall**

```powershell
# Allow SSH through firewall (restrict to Tailscale network later)
New-NetFirewallRule -DisplayName "SSH (Tailscale)" -Direction Inbound -Action Allow -RemoteAddress 100.64.0.0/10 -Protocol TCP -LocalPort 22
```

- [ ] **Step 5: Generate SSH key on client devices (for testing)**

```bash
# On client device (e.g., phone with termux)
ssh-keygen -t ed25519
```

- [ ] **Step 6: Copy public key to Windows**

```powershell
# Copy public key to authorized_keys
# From client: scp ~/.ssh/id_ed25519.pub noorul@<tailscale-ip>:~/.ssh/authorized_keys
```

---

## Phase 4: WSL Ubuntu Environment Setup

### Task 5: Install Development Tools in WSL

- [ ] **Step 1: Install tmux**

```bash
sudo apt install -y tmux
```

- [ ] **Step 2: Install mosh**

```bash
sudo apt install -y mosh
```

- [ ] **Step 3: Install ntfy client**

```bash
sudo apt install -y ntfy
```

- [ ] **Step 4: Verify installations**

```bash
tmux -V
mosh --version
ntfy --version
```

---

## Phase 5: Claude Code Installation

### Task 6: Install Claude Code in WSL

- [ ] **Step 1: Install Claude Code CLI**

```bash
# In WSL Ubuntu
curl -s https://anthropic.claude.com/linux_install.sh | sh
```

- [ ] **Step 2: Verify installation**

```bash
claude --version
```

- [ ] **Step 3: Configure Claude Code**

```bash
# Initial setup
claude auth
# Follow prompts to authenticate
```

---

## Phase 6: tmux Session Configuration

### Task 7: Create Persistent tmux Session

- [ ] **Step 1: Create tmux configuration**

```bash
# Create .tmux.conf
cat > ~/.tmux.conf << 'EOF'
set -g base-index 1
set -g status-bg green
set -g status-fg black
set -g mouse on
bind-key -n C-r source-file ~/.tmux.conf
EOF
```

- [ ] **Step 2: Create persistent tmux session**

```bash
# Create session that persists
tmux new-session -d -s claude "echo 'Claude session started'"
tmux list-sessions
```

---

## Phase 7: Auto-Reconnect Configuration

### Task 8: Configure SSH to Auto-Attach to tmux

- [ ] **Step 1: Add tmux attach to .bashrc**

```bash
# Add to ~/.bashrc
echo 'if [ -z "$TMUX" ]; then
  if tmux has-session -t claude 2>/dev/null; then
    exec tmux attach -t claude
  else
    exec tmux new-session -s claude
  fi
fi' >> ~/.bashrc
```

- [ ] **Step 2: Test auto-reconnect**

```bash
# Log out and SSH back in - should auto-attach
```

---

## Phase 8: MOSH Configuration

### Task 9: Configure MOSH over Tailscale

- [ ] **Step 1: Allow MOSH through Windows Firewall**

```powershell
# Run as Administrator
New-NetFirewallRule -DisplayName "MOSH (Tailscale)" -Direction Inbound -Action Allow -RemoteAddress 100.64.0.0/10 -Protocol UDP -LocalPort 60000-61000
```

- [ ] **Step 2: Test MOSH**

```bash
# From client device
mosh noorul@<tailscale-ip>
```

---

## Phase 9: ntfy Notifications Setup

### Task 10: Configure ntfy Notifications

- [ ] **Step 1: Set ntfy environment variable**

```bash
# Add to ~/.bashrc
echo 'export NTFY_TOPIC="claude-access-$(hostname)"' >> ~/.bashrc
source ~/.bashrc
```

- [ ] **Step 2: Create helper scripts**

```bash
# ~/scripts/notify-complete
mkdir -p ~/scripts
cat > ~/scripts/notify-complete << 'EOF'
#!/bin/bash
MSG="${1:-Task completed}"
ntfy send "$MSG"
EOF

cat > ~/scripts/notify-input << 'EOF'
#!/bin/bash
MSG="${1:-Waiting for input}"
ntfy send -t "⚠️ Input Needed" "$MSG"
EOF

cat > ~/scripts/notify-fail << 'EOF'
#!/bin/bash
MSG="${1:-Task failed}"
ntfy send -t "❌ Failed" "$MSG"
EOF

chmod +x ~/scripts/notify-*
```

- [ ] **Step 3: Test notifications**

```bash
~/scripts/notify-complete "Test message"
```

---

## Phase 10: Helper Scripts

### Task 11: Create Management Scripts

- [ ] **Step 1: Create start-claude script**

```bash
cat > ~/scripts/start-claude << 'EOF'
#!/bin/bash
if tmux has-session -t claude 2>/dev/null; then
  echo "Session claude already exists. Attaching..."
  tmux attach -t claude
else
  echo "Creating new claude session..."
  tmux new-session -d -s claude
  tmux send-keys -t claude "claude" C-m
  sleep 2
  tmux attach -t claude
fi
EOF
chmod +x ~/scripts/start-claude
```

- [ ] **Step 2: Create restart-claude script**

```bash
cat > ~/scripts/restart-claude << 'EOF'
#!/bin/bash
tmux kill-session -t claude 2>/dev/null
sleep 1
tmux new-session -d -s claude
tmux send-keys -t claude "claude" C-m
echo "Claude session restarted"
~/scripts/notify-complete "Claude session restarted"
EOF
chmod +x ~/scripts/restart-claude
```

- [ ] **Step 3: Test scripts**

```bash
~/scripts/start-claude
```

---

## Phase 11: Verification

### Task 12: Verify All Components

- [ ] **Step 1: Verify Tailscale connection**

```powershell
# Windows side
tailscale status
tailscale ip -4
```

```bash
# WSL side
tailscale status
tailscale ip -4
```

- [ ] **Step 2: Verify SSH access**

```bash
# From client device
ssh noorul@<tailscale-ip>
```

- [ ] **Step 3: Verify MOSH**

```bash
# From client device
mosh noorul@<tailscale-ip>
```

- [ ] **Step 4: Verify tmux persists**

```bash
# SSH in - should auto-attach to tmux
tmux list-sessions
```

- [ ] **Step 5: Verify Claude launches**

```bash
# In tmux session
claude --version
```

- [ ] **Step 6: Verify notifications**

```bash
~/scripts/notify-complete "Verification test"
```

---

## Phase 12: Connection Details Output

### Task 13: Display Final Connection Information

```bash
echo "========================================"
echo "REMOTE ACCESS CONFIGURATION COMPLETE"
echo "========================================"
echo ""
echo "Tailscale IP: $(tailscale ip -4)"
echo "Windows User: noorul"
echo ""
echo "SSH Access:"
echo "  ssh noorul@<tailscale-ip>"
echo ""
echo "MOSH Access:"
echo "  mosh noorul@<tailscale-ip>"
echo ""
echo "tmux Reconnect:"
echo "  tmux attach -t claude"
echo ""
echo "Helper Scripts:"
echo "  ~/scripts/start-claude"
echo "  ~/scripts/restart-claude"
echo "  ~/scripts/notify-complete"
echo "  ~/scripts/notify-input"
echo "  ~/scripts/notify-fail"
echo ""
echo "ntfy Topic: $NTFY_TOPIC"
echo "========================================"
```