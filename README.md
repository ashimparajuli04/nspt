# nspt 🍐

Secure, serverless `.env` sync for teams — built on Git.

No backend, no accounts. Your Git repo is the transport layer, and encryption happens entirely on your machine using age encryption.

## How it works

- `nspt init` — detect your GitHub identity, create your first group
- `nspt add <group> <username>` — add a teammate (fetches their GitHub SSH key for verification)
- `nspt create-group <name>` — create a new group
- `nspt delete-group <group>` — permanently delete a group (confirm + type its name)
- `nspt track <group> <file>` — register a file for encryption
- `nspt track-env <group>` — auto-discover and track all `.env` files in the repo
- `nspt untrack <group>` — remove a file from a group and delete its encrypted copy
- `nspt encrypt <group>` — encrypt all tracked files
- `nspt decrypt <group>` — decrypt files to their original paths
- `nspt update-keys <group>` — re-fetch GitHub keys for all members
- `nspt rotate-key <group>` — rotate the group file key and re-wrap it for all members
- `nspt remove <group> <username>` — remove a member and rotate the file key

Only people you've explicitly added can decrypt anything. Not even the Git host can read the contents. Tracking and untracking require group membership (verified by unlocking the group key). Public keys are fetched from GitHub's `https://github.com/<username>.keys` endpoint — no API token or rate limits required.

## Install

```bash
npm install -g @envee/nspt
```

## Quickstart

```bash
nspt init
# initialize nspt and create your first group

nspt add <groupName> torvalds
# fetches torvalds's GitHub public key, grants her access

nspt track <groupName> .env
# registers .env for encryption

nspt track-env <groupName>
# finds every .env/.env.local/... file in the repo, asks for confirmation, and tracks them

nspt encrypt <groupName>
# encrypts tracked files into ./nspt/<groupName>/encfiles/

git add . && git commit -m "encrypt patan" && git push
```

Teammate's side:

```bash
git pull
nspt decrypt <groupName>
```

## Commands

| Command | Description |
|---------|-------------|
| `nspt init` | Initialize nspt and create your first group |
| `nspt create-group <name>` | Create a new group |
| `nspt delete-group <group>` | Permanently delete a group (confirm + type its name) |
| `nspt track <group> <filepath>` | Track a file for encryption |
| `nspt track-env <group>` | Auto-track all `.env` files in the repo (skips `.env.example`) |
| `nspt untrack <group>` | Untrack a file and delete its encrypted copy |
| `nspt encrypt <group>` | Encrypt all tracked files |
| `nspt decrypt <group>` | Decrypt files to original paths |
| `nspt add <group> <username>` | Add a user to a group |
| `nspt update-keys <group>` | Re-fetch GitHub keys for all members |
| `nspt rotate-key <group>` | Rotate the group file key and re-wrap it for all members |
| `nspt remove <group> <username>` | Remove a member and rotate the file key |

## License

MIT
