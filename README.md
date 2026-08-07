# Envoo 🌱

Secure, versioned `.env` sync for teams. No more sharing secrets over chat apps or email.

## The problem

Environment files get passed around in Slack, Discord, WhatsApp, or email. Over time you end up with multiple stale copies, missing variables, and no idea which version is actually current.

## What Envoo does

Envoo gives your team a centralized, encrypted place to store and sync `.env` files — right from the CLI.

- **Encrypted** — secrets are encrypted before they ever leave your machine.
- **Simple** — a Git-like workflow your team already knows.

## Quickstart

```bash
# install
npm install -g envoo

# inside your project's git repo
envoo init

# push your local .env to the team
envoo push

# pull the latest .env
envoo pull
```

## Core commands

| Command | Description |
|---|---|
| `envoo init` | Link the local repo to a remote Envoo project |
| `envoo push` | Upload your local `.env` |
| `envoo pull` | Fetch and apply the latest `.env` |

Versioning, diffing, and history are on the roadmap — not yet implemented.

## Status

🚧 Early development — not yet ready for production use.