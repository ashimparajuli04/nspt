# nspt 🍐

Secure, serverless `.env` sync for teams — built on Git.

No backend, no accounts. Your Git repo is the transport layer, and encryption happens entirely on your machine using your GitHub SSH key.

## How it works 🌱

- Create a group with `nspt init`.
- Add teammates with their GitHub username — their public key is fetched automatically.
- Push encrypted `.env` files alongside your normal `git push`.
- Teammates run `nspt sync <group>` after a `git pull` to decrypt and apply the latest files.

Only people you've explicitly added can decrypt anything. Not even the Git host can read the contents.

## Install

```bash
npm install -g nspt
```

## Quickstart

```bash
nspt init
# enter group name: patan

nspt add alice04
# fetches alice04's GitHub public key, grants her access

nspt push
# encrypts tracked files, writes them into ./nspt/patan/encfiles

git add . && git commit -m "sync patan" && git push
```

Teammate's side:

```bash
git pull
nspt sync patan
```

## Status

🚧 Early development — not yet ready for production use.

## License

MIT