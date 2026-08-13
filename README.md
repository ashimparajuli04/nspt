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

---

<details>
<summary><strong>Workings for nerds</strong></summary>

If you're curious about what actually happens behind the scenes, here's the short version.

### 1. Every group has a file-encryption key

When a group is created, `nspt` generates a cryptographically random **256-bit key** for that group.

This key is used to encrypt the files tracked by the group.

```text
Group
 │
 └── 256-bit file key
          │
          ├── encrypts .env
          ├── encrypts .env.local
          └── encrypts other tracked files
```

The key itself is never stored in plaintext inside the repository.

---

### 2. Files are encrypted locally

When you run `nspt push`, the plaintext files never need to leave your machine.

The flow is essentially:

```text
             Your machine
                  │
                  ▼
             frontend/.env
                  │
                  ▼
           encrypt with group key
                  │
                  ▼
      nspt/<group>/encfiles/...
                  │
                  ▼
                Git
```

Only the encrypted version is written to the `nspt` directory.

The original file stays where it was.

---

### 3. So how can multiple people use the same key?

This is where public-key encryption comes in.

The group has one symmetric file-encryption key, but every member has their own public/private key pair.

Instead of putting the group key directly in Git, `nspt` encrypts (wraps) the group key separately for every member using their public key.

For example:

```text
                    Group file key
                         │
             ┌───────────┼───────────┐
             │           │           │
             ▼           ▼           ▼
        Alice's key   Bob's key   Charlie's key
             │           │           │
             ▼           ▼           ▼
       wrapped key   wrapped key   wrapped key
```

The repository can contain all of those wrapped keys.

But only the corresponding private key can unwrap each one.

---

### 4. Where do public keys come from?

`nspt` uses GitHub as the public-key directory.

When a user is added, `nspt` fetches their SSH public keys from:

```text
https://github.com/<username>.keys
```

This means there is no key exchange between teammates.

You don't need to:

```text
❌ copy a public key
❌ send a key over Discord
❌ paste a key into a config file
```

The user's GitHub SSH public key is enough for `nspt` to identify a key that can be used to grant them access.

Their corresponding private key remains on their own machine.

---

### 5. What gets stored in Git?

Conceptually, the repository contains something like:

```text
nspt/
└── my-team/
    ├── config.toml
    ├── user_keys.toml
    └── encfiles/
        ├── frontend-env-987af88e.enc
        └── backend-envb-99b7057.enc
```

The encrypted files use automatically generated names, while the original file paths are tracked separately.

In simplified terms:

```text
plaintext .env       → stays on your machine
encrypted .env       → goes into Git
group key            → never stored directly
wrapped group keys   → stored for individual members
private keys         → stay on member machines
```

So the Git host doesn't need to be trusted with the actual secrets.

---

### 6. What happens when someone runs `nspt pull`?

The process works in reverse.

```text
Git repository
      │
      ▼
encrypted file + wrapped group key
      │
      ▼
member's private key
      │
      ▼
unwrap group key
      │
      ▼
decrypt encrypted file
      │
      ▼
original filepath
```

For example:

```text
nspt/<group>/encfiles/frontend-env-987af88e.enc
                         │
                         ▼
                      decrypt
                         │
                         ▼
                   frontend/.env
```

The original path is tracked alongside the encrypted file, allowing `nspt` to restore the file where it originally came from.

---

### 7. Why not just encrypt every file directly with each member's public key?

Because a person can have multiple public keys, encrypting every file directly with their public keys would be storage-inefficient.

For example, if Bob has 5 public keys registered on GitHub, we would need to store 5 encrypted copies of every file for Bob.

Instead, `nspt` uses a **hybrid encryption** approach.

The actual files are encrypted once using symmetric encryption:

```text
                  .env
                   │
                   ▼
          symmetric encryption
                   │
                   │
            256-bit group key
                   │
                   ▼
             encrypted file
```

Then the small group key is protected using public-key encryption:

```text
              256-bit group key
                     │
       ┌─────────────┼─────────────┐
       ▼             ▼             ▼
   Alice's pub    Bob's pub    Charlie's pub
       │             │             │
       ▼             ▼             ▼
   wrapped key   wrapped key   wrapped key
```

This gives you the efficiency of symmetric encryption for the actual files while still allowing different people to securely access the same data.

---

### 8. What happens when a member is removed?

Simply deleting their wrapped key isn't enough.

They may already have a copy of the old group key.

So when a member is removed, `nspt` performs key rotation:

```text
                Old group key
                     │
          ┌──────────┼──────────┐
          ▼          ▼          ▼
        Alice        Bob      Charlie
                    ❌
                 removed

                     │
                     ▼
                new group key
                     │
          ┌──────────┴──────────┐
          ▼                     ▼
        Alice                Charlie
```

The files are re-encrypted using the new group key, and the new key is wrapped for the remaining members.

Bob can still possess the old key, but the newly encrypted files require the new one.

---

### 9. What if someone's GitHub SSH key changes?

`nspt` can re-fetch the public keys for the group's members.

The important distinction is that **GitHub only provides the public side of the key**.

The private key used to decrypt the wrapped group key remains on the member's machine.

---

### 10. What if someone gets the entire repository?

They can see the encrypted files and the encrypted/wrapped group keys.

They cannot simply read the `.env` files from the repository.

For the actual file-encryption key, `nspt` uses cryptographically secure random generation rather than deriving it from a human password.

So an attacker can certainly try to brute-force the key, but a **256-bit random key has 2²⁵⁶ possible combinations**. Even with an absurd amount of computing power—trillions of machines working continuously—the keyspace is so enormous that brute-forcing it is astronomically impractical.

The security model therefore assumes:

```text
Git repository      → potentially public
Git host            → untrusted
Encrypted files     → safe to store in Git

Member private key  → secret
Member machine      → trusted
Plaintext .env      → local
```

That's the basic idea behind nspt:

**Git handles synchronization; cryptography handles confidentiality.**

</details>

---

## License

MIT