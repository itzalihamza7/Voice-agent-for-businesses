#!/bin/bash
# Ships the images and config to the server and (re)starts the stack.
#   deploy/aws/deploy.sh <server ip> <ssh key file>
# Images: build them first for linux/amd64 (see README.md). On the first run the server's .env
# is created with random secrets; OPENAI_API_KEY is read from .ddev/.env.web, never printed.
set -euo pipefail
IP="$1"; KEY="$2"
HOST="$(echo "$IP" | tr . -).sslip.io"
SSH=(ssh -i "$KEY" -o StrictHostKeyChecking=accept-new "ec2-user@$IP")
DIR=/opt/voice-agent
cd "$(dirname "$0")"

echo "Copying config…"
scp -i "$KEY" -o StrictHostKeyChecking=accept-new compose.yml Caddyfile "ec2-user@$IP:$DIR/"

echo "Copying images (this takes a few minutes)…"
docker save voice-agent-web:aws voice-agent-migrate:aws voice-agent-gateway:aws | gzip -1 \
  | "${SSH[@]}" "gunzip | docker load"

if ! "${SSH[@]}" "test -f $DIR/.env"; then
  echo "Creating the server's .env with new secrets…"
  KEY_LINE=$(grep -E '^OPENAI_API_KEY=' ../../.ddev/.env.web || true)
  "${SSH[@]}" "umask 077; cat > $DIR/.env" <<ENV
${KEY_LINE}
PUBLIC_HOST=${HOST}
APP_SECRET=$(openssl rand -hex 32)
GATEWAY_SECRET=$(openssl rand -hex 32)
POSTGRES_PASSWORD=$(openssl rand -hex 16)
DEMO_PASSWORD=$(openssl rand -base64 12 | tr -d '/+=')
OPENAI_MODEL=gpt-4.1-mini
OPENAI_MODELS=gpt-4.1-mini,gpt-4o-mini
EMBEDDING_MODELS=openai/text-embedding-3-small
PHONE_MODEL=openai/gpt-4o-mini
VOICE_STT=openai
VOICE_TTS=openai
TOOLS_ALLOW_PRIVATE_HOSTS=false
ENV
fi

echo "Starting…"
"${SSH[@]}" "cd $DIR && docker compose up -d --remove-orphans && docker image prune -f >/dev/null"
echo "Done: https://$HOST"
