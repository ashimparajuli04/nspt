# nspt 🍐

Secure, serverless `.env` sync for teams — built on Git.

No backend, no accounts. Your Git repo is the transport layer, and encryption happens entirely on your machine using age encryption.

## How it works

- `nspt init` — detect your GitHub identity, create your first group
- `nspt add <group> <username>` — add a teammate (fetches their GitHub SSH key for verification)
- `nspt track <group> <file>` — register a file for encryption
- `nspt sync-up <group>` — encrypt all tracked files
- `nspt sync <group>` — decrypt files to their original paths
- `nspt update-keys <group>` — re-fetch GitHub keys for all members

Only people you've explicitly added can decrypt anything. Not even the Git host can read the contents.

## Install

```bash
npm install -g nspt
```

## Quickstart

```bash
nspt init
# enter group name: patan

nspt add patan alice04
# fetches alice04's GitHub public key, grants her access

nspt track patan .env
# registers .env for encryption

nspt sync-up patan
# encrypts tracked files into ./nspt/patan/encfiles/

git add . && git commit -m "sync patan" && git push
```

Teammate's side:

```bash
git pull
nspt sync patan
```

## Commands

| Command | Description |
|---------|-------------|
| `nspt init` | Initialize nspt and create your first group |
| `nspt create-group <name>` | Create a new group |
| `nspt track <group> <filepath>` | Track a file for encryption |
| `nspt sync-up <group>` | Encrypt all tracked files |
| `nspt sync <group>` | Decrypt files to original paths |
| `nspt add <group> <username>` | Add a user to a group |
| `nspt update-keys <group>` | Re-fetch GitHub keys for all members |

## Status

Early development — not yet ready for production use.

## License

MIT
