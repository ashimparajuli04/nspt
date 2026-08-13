# nspt 🍐

**Encrypted `.env` and secret-file sharing for teams — synced through Git.**

`nspt` lets your team keep sensitive configuration files in a Git repository **without putting the plaintext secrets in Git**.

You track a file once, `nspt` encrypts it locally, and the encrypted version can safely be committed and pushed. Only members you've explicitly added can decrypt it on their own machines.



---

## Why nspt?

Sharing `.env` files with a team usually ends up looking like this:

```text
"Hey, can you send me the latest .env?"
       ↓
Discord / Slack / Email / WhatsApp
       ↓
Someone now has another copy of your secrets
```

With `nspt`:

```text
                 Git
                  │
          encrypted secrets
                  │
        ┌─────────┴─────────┐
        ▼                   ▼
      Alice                 Bob
        │                   │
     decrypt              decrypt
        │                   │
        ▼                   ▼
      .env                 .env
```

Git only stores the encrypted files. Your actual secrets stay on the machines that can decrypt them.

---

## 🚀 Quick Start

### 1. Install

```bash
npm install -g @envee/nspt
```

### 2. Initialize your project

Run this inside your Git repository:

```bash
nspt init
```

This initializes `nspt` and creates your first group.

### 3. Add your teammates

```bash
nspt add <group> <github-username>
```

For example:

```bash
nspt add development torvalds
```

`nspt` automatically fetches the user's public SSH key from GitHub, so **you don't need to exchange keys manually**.

### 4. Track your secret files

For one file:

```bash
nspt track <group> .env
```

Or automatically find your environment files:

```bash
nspt track-env <group>
```

`track-env` looks for `.env`, `.env.local`, `.env.production`, and similar files while skipping `.env.example`.

### 5. Encrypt and push

```bash
nspt push <group>

git add .
git commit -m "update encrypted secrets"
git push
```

The encrypted files are stored under:

```text
nspt/<group>/encfiles/
```

### 6. Your teammate pulls the secrets

After cloning the repository and getting the latest changes:

```bash
git pull
nspt pull <group>
```

Their files are restored to the **same paths they were originally tracked from**.

That's it.

---


## 👥 Typical Team Workflow

Once everyone is set up, the normal workflow is intentionally simple.

### When you change a secret

```bash
nspt push
git add .
git commit -m "update secrets"
git push
```

### When a teammate changes the secrets

```bash
git pull
nspt pull
```

### When someone joins the team

```bash
nspt add <group> <github-username>
```

### When someone leaves

```bash
nspt remove <group> <github-username>
```

`nspt` removes their access and rotates the group's encryption key.

---

# 🔐 How It Works

`nspt` uses **end-to-end encryption**.

Your plaintext secret file is encrypted **on your machine** before it is written to the repository.

Conceptually:

```text
                  Your machine
                       │
                       ▼
                    .env
                       │
                       ▼
                Encrypt locally
                       │
                       ▼
              encrypted .env file
                       │
                       ▼
                    Git repo
                       │
              ┌────────┴────────┐
              ▼                 ▼
           Teammate A       Teammate B
              │                 │
              ▼                 ▼
           decrypt            decrypt
              │                 │
              ▼                 ▼
             .env              .env
```

The Git host only sees encrypted data.

### Adding a teammate

When you run:

```bash
nspt add <group> <username>
```

`nspt` fetches the user's GitHub SSH public key from:

```text
https://github.com/<username>.keys
```

That public key is used to give the teammate access to the group's encryption key.

The teammate's private key stays on **their machine**.

There is no need to send a private key or manually exchange public keys.

### Encrypting the files

Each group has a file-encryption key.

Tracked files are encrypted locally using that key.

The group key itself is then protected for each member using their public key:

```text
                  Group encryption key
                           │
             ┌─────────────┼─────────────┐
             ▼             ▼             ▼
          Alice's       Bob's          Charlie's
         public key    public key      public key
             │             │             │
             ▼             ▼             ▼
         wrapped key   wrapped key    wrapped key
```

Each member can use their corresponding private key to recover the group key.

The repository can therefore contain the encrypted files and wrapped keys without containing the plaintext secrets.

---

# 🛡️ Security Model

`nspt` is designed around the assumption that **the Git repository itself should not be trusted with your secrets**.

An attacker who only obtains the repository gets things such as:

```text
encrypted files
encrypted/wrapped group keys
group metadata
```

They do **not** get the private keys stored on team members' machines.

The file-encryption key is generated using cryptographically secure random bytes, rather than being derived from a human-readable password.

So an attacker cannot realistically recover the secrets by simply brute-forcing the encrypted file.

### What nspt protects against

* Git hosting providers reading your `.env` files
* Accidentally exposing plaintext secrets through the repository
* Manually exchanging encryption keys between teammates
* A removed teammate decrypting newly rotated secrets

### What nspt does not protect against

If a member's machine or private key is compromised, an attacker may be able to access secrets that member is authorized to decrypt.

Likewise, once a secret is decrypted into a process or file, `nspt` cannot control what happens to it afterward.

---

# 📁 Groups

A group represents a set of people who share encrypted files.

For example:

```text
development
├── Alice
├── Bob
└── Charlie
```

You can create separate groups when different people need access to different secrets:

```text
development
├── Alice
└── Bob

production
├── Alice
└── Charlie
```

A person being in one group does not automatically give them access to another group.

---

# 🧩 Tracking Files

`nspt` does not automatically encrypt every file in your repository.

You explicitly tell it which files belong to a group:

```bash
nspt track development .env
```

You can also track multiple environment files automatically:

```bash
nspt track-env development
```

The original paths are recorded so that:

```text
config/.env.production
```

is restored to:

```text
config/.env.production
```

when a teammate runs `nspt pull`.

---

# 🔄 Updating Access

### Add someone

```bash
nspt add <group> <username>
```

Their public key is fetched from GitHub and the group key is made available to them.

### Remove someone

```bash
nspt remove <group> <username>
```

Removing a member also **rotates the group key**.

This is important because simply deleting someone's wrapped copy of the old key would not be enough — they could still possess the old key.

After rotation:

```text
Old key
  │
  ├── Alice ✓
  ├── Bob ✗ removed
  └── Charlie ✓

        ↓ rotate

New key
  │
  ├── Alice ✓
  └── Charlie ✓
```

Previously encrypted files are re-encrypted with the new key.

---

# 🔑 Key Management

If a teammate's GitHub SSH key changes:

```bash
nspt update-keys <group>
```

This re-fetches the GitHub keys for the group's members.

If you need to proactively replace the group's encryption key:

```bash
nspt rotate-key <group>
```

The new key is wrapped for the current members.

---

# 📋 Commands

Most users only need:

```text
init
add
track
track-env
push
pull
remove
```

The complete command set is:

| Command                          | What it does                                       |
| -------------------------------- | -------------------------------------------------- |
| `nspt init`                      | Initialize nspt and create your first group        |
| `nspt create-group <name>`       | Create a new group                                 |
| `nspt delete-group [group]`      | Permanently delete a group                         |
| `nspt track <group> <filepath>`  | Track a file for encryption                        |
| `nspt track-env [group]`         | Find and track environment files                   |
| `nspt untrack [group]`           | Stop tracking a file and remove its encrypted copy |
| `nspt push [group]`              | Encrypt tracked files                              |
| `nspt pull [group]`              | Decrypt tracked files                              |
| `nspt diff [group]`              | Preview changes before decrypting                  |
| `nspt add [group] [username]`    | Add a GitHub user to a group                       |
| `nspt update-keys [group]`       | Re-fetch member keys from GitHub                   |
| `nspt rotate-key [group]`        | Generate a new group encryption key                |
| `nspt remove [group] [username]` | Remove a member and rotate the key                 |

All arguments in `[brackets]` are optional. If omitted, `nspt` will ask for them interactively.

---

# 📦 What Gets Committed?

After running:

```bash
nspt push
```

your repository contains encrypted data under:

```text
nspt/
└── <group>/
    └── encfiles/
```

Your original `.env` files remain local.

You can safely commit the `nspt/` directory:

```bash
git add nspt/
git commit -m "update encrypted secrets"
git push
```

> **Do not commit your original plaintext `.env` files.**

A `.gitignore` entry for your plaintext secret files is still recommended.

---

# 🧠 Why Git?

`nspt` intentionally uses Git rather than introducing another synchronization service.

That means you can use the Git hosting provider you're already using:

```text
                 nspt
                  │
                  ▼
             encrypted files
                  │
                  ▼
             ┌──────────┐
             │   Git    │
             └────┬─────┘
                  │
          ┌───────┴───────┐
          ▼               ▼
        Alice             Bob
```

Git handles:

* synchronization
* history
* branching
* collaboration
* conflict resolution

`nspt` handles:

* encryption
* key management
* access control
* restoring files

---

# ⚠️ Important Notes

`nspt` is intended for sharing secrets between trusted team members.

Your Git repository contains encrypted secrets, but **the machines that can decrypt them still need to be protected**.

Keep your private keys private and never commit them to Git.

If a member's private key is compromised, treat that member's access as compromised and rotate the group's key.

---

# 📄 License

MIT
