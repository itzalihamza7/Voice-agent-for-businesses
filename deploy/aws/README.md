# Deploying to AWS (one EC2 server)

The whole platform on one small EC2 instance: PostgreSQL with pgvector, the web app, the voice
gateway and [Caddy](https://caddyserver.com) for HTTPS, run with Docker Compose. Fits the free
tier (t3.micro, 20 GB disk, one public IP); otherwise roughly $12–16 a month.

| File              | What it is                                                                |
| ----------------- | ------------------------------------------------------------------------- |
| `compose.yml`     | The stack: db, migrate (runs once), web, gateway, caddy                   |
| `Caddyfile`       | HTTPS for `PUBLIC_HOST`; `/twilio/*` goes to the gateway, the rest to web |
| `server-setup.sh` | First-boot user data: Docker, the compose plugin and 2 GB of swap         |
| `deploy.sh`       | Copies config and images to the server, creates its `.env`, starts it     |

## First deployment

1. **Server.** Launch a t3.micro with Amazon Linux 2023, a 20 GB gp3 disk and
   `server-setup.sh` as user data. Its security group allows 80 and 443 from anywhere and 22
   from your IP only. Attach an Elastic IP so the address doesn't change.
2. **Images.** The server is too small to build the app, so build on your machine for its CPU:

   ```bash
   for target in web migrate gateway; do
     docker buildx build --platform linux/amd64 --target $target -t voice-agent-$target:aws --load .
   done
   ```

3. **Deploy:** `deploy/aws/deploy.sh <elastic ip> <ssh key file>`. The first run writes the
   server's `.env` with random secrets and your `OPENAI_API_KEY` (from `.ddev/.env.web`).
4. Open `https://<ip with dashes>.sslip.io` and sign in as `demo@example.com` with the
   `DEMO_PASSWORD` from the server's `.env` (`ssh … cat /opt/voice-agent/.env`), or as the
   platform admin (`ADMIN_EMAIL` / `ADMIN_PASSWORD` from the same file). Anyone can create a
   business with **Get started**.

To update, rebuild the images and run `deploy.sh` again; the database and secrets stay.

## What's different from development

- **Models.** OpenAI retired `gpt-4.1-nano` in October 2026, so the fast default is
  `gpt-4o-mini` (decisions, phone calls, eval callers) with `gpt-4.1-mini` for judging. The
  GPT-5 family needs a small provider change first: it only accepts the default temperature.
- **OpenAI only.** Ollama runs on a developer's Mac, not on this server, so production uses
  OpenAI language models and `text-embedding-3-small`. Add the example documents from the
  knowledge base page.
- **The demo MCP server** isn't reachable as a tool: production blocks private addresses (SSRF
  guard), as it should.
- **Phone calls:** point a Twilio number's voice webhook at `https://<host>/twilio/voice` and add
  `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` to the server's `.env` for transfers.
- **Backups:** the database lives in a Docker volume on the instance's disk; take EBS snapshots
  (or a scheduled `pg_dump`) before relying on it.
