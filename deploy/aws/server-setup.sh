#!/bin/bash
# Runs once when the EC2 instance first boots (user data, Amazon Linux 2023): Docker with the
# compose plugin, and 2 GB of swap so the 1 GB instance has room.
set -euxo pipefail
dnf install -y docker
systemctl enable --now docker
usermod -aG docker ec2-user
mkdir -p /usr/local/lib/docker/cli-plugins
curl -fsSL "https://github.com/docker/compose/releases/download/v2.39.4/docker-compose-linux-x86_64" \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
if [ ! -f /swapfile ]; then
  dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo "/swapfile none swap sw 0 0" >> /etc/fstab
fi
mkdir -p /opt/voice-agent && chown ec2-user:ec2-user /opt/voice-agent
