# nspt 🍐

Encrypted `.env` sharing for your team — synced through Git, decrypted only on your machines.

End-to-end encrypted: secrets are sealed with age on your machine and can only be opened by members you've explicitly added — not even the Git host can read the contents. No keys to exchange, either: member keys are fetched automatically from GitHub, so nobody ever has to share a public key (or any key) by hand.

## How it works

- `nspt init` — detect your GitHub identity, create your first group
- `nspt add [group] [username]` — add a teammate (fetches their GitHub SSH key for verification)
- `nspt create-group <name>` — create a new group
- `nspt delete-group [group]` — permanently delete a group (confirm + type its name)
- `nspt track <group> <file>` — register a file for encryption
- `nspt track-env [group]` — auto-discover and track all `.env` files in the repo
- `nspt untrack [group]` — remove a file from a group and delete its encrypted copy
- `nspt push [group]` — encrypt all tracked files
- `nspt pull [group]` — decrypt files to their original paths
- `nspt diff [group]` — preview how decrypting would update your tracked files
- `nspt update-keys [group]` — re-fetch GitHub keys for all members
- `nspt rotate-key [group]` — rotate the group file key and re-wrap it for all members
- `nspt remove [group] [username]` — remove a member and rotate the file key

Arguments in `[brackets]` are optional — omit them and nspt will ask you interactively.

Only people you've explicitly added can decrypt anything — end to end, from your machine to theirs. Not even the Git host can read the contents. Tracking and untracking require group membership (verified by unlocking the group key). Public keys are fetched from GitHub's `https://github.com/<username>.keys` endpoint — no API token, rate limits, or manual key sharing required.

## Interactive menu

Running `nspt` with no command opens a guided menu. Navigate with `↑`/`↓`, select with `Enter`, and press `Esc` to go back a level (or quit from the top menu). Every menu item is also available as a direct CLI command below.

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

nspt push <groupName>
# encrypts tracked files into ./nspt/<groupName>/encfiles/

git add . && git commit -m "encrypt tracked files" && git push
```

Teammate's side:

```bash
git pull
nspt pull <groupName>
```

## Commands

| Command | Description |
|---------|-------------|
| `nspt init` | Initialize nspt and create your first group |
| `nspt create-group <name>` | Create a new group |
| `nspt delete-group [group]` | Permanently delete a group (confirm + type its name) |
| `nspt track <group> <filepath>` | Track a file for encryption |
| `nspt track-env [group]` | Auto-track all `.env` files in the repo (skips `.env.example`) |
| `nspt untrack [group]` | Untrack a file and delete its encrypted copy |
| `nspt push [group]` | Encrypt all tracked files |
| `nspt pull [group]` | Decrypt files to original paths |
| `nspt diff [group]` | Preview how decrypting would update your tracked files |
| `nspt add [group] [username]` | Add a user to a group |
| `nspt update-keys [group]` | Re-fetch GitHub keys for all members |
| `nspt rotate-key [group]` | Rotate the group file key and re-wrap it for all members |
| `nspt remove [group] [username]` | Remove a member and rotate the file key |

Arguments in `[brackets]` are optional — omit them and nspt will ask you interactively.

## License

MIT
