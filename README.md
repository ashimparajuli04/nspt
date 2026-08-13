# nspt🍐

Encrypted .env and secret-file sharing for teams — synced through Git.


End-to-end encrypted: secrets are encrypted and can only be opened by members you've explicitly added — not even the Git host can read the contents.
No keys to exchange either: member keys are fetched automatically from GitHub and everything isdecrypted locally.
No public keys to copy. No secrets to paste into chat.

## 🎬 See It In Action (interactive terminal user interface)

### Initialize, track, encrypt and push

![nspt init demo](demo/init.gif)

### Add a teammate

![nspt add teammate demo](demo/add_teammate.gif)

Once they're added, you can simply use Git to share the encrypted secrets:

```bash
git push <groupName>
```

Your teammate can then:

```bash
git pull
nspt pull <groupName>
```

---


# 🖥️ Interactive Mode

You don't have to remember every command.

Run:

```bash
nspt
```

to open the interactive terminal interface.

Use:

* `↑` / `↓` — navigate
* `Enter` — select
* `Esc` — go back

Every action available in the menu can also be performed through the CLI.

---

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

nspt track <groupName> frontend/.env
# registers that frontend/.env for encryption

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
| `nspt` | Same features just with an interactive menu |
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


## License

MIT