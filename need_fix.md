# nspt — issues to fix

Work through these one by one. Check off when done.

## Security

- [x] **Path traversal via group name** — no validation on group names. `nspt create-group ../../foo` resolves outside `nspt/`, and `config.toml`/`user_keys.toml` get written wherever `path.join(process.cwd(), "nspt", groupName)` lands. Validate against `..`, `/`, and path separators. (`src/flows/create_group_flow.ts`) — **fixed**: `validateGroupName` rejects `/`, `\`, `..`, and empty names, applied to both CLI arg and TUI prompt; names are trimmed.
- [x] **config.toml trust = arbitrary file read/write** — `encryptAllTrackedFiles`/`decryptAllFiles` trust `files[].path` from config.toml, which lives in the git-synced repo. A collaborator who can push to the repo can point a path at `~/.bashrc` and `nspt sync` overwrites it with plaintext — or `sync-up` reads arbitrary local files. Validate paths: no absolute paths, no `..`, must stay under the repo root. (`src/core/enc_dec_file.ts`) — **fixed**: `isPathWithinRoot` resolves and verifies every tracked path stays under `process.cwd()`, enforced at track time (`track_flow`) and again at encrypt/decrypt time (`enc_dec_file.ts`) so tampered config.toml entries fail closed.
- [ ] **`sync` writes plaintext permanently to disk** — decrypted secrets are written back to `file.path` and stay there. If the model is "secrets only exist transiently," this defeats it. Document or change. (`src/core/enc_dec_file.ts:75`)

## Bugs

- [ ] **`nspt init` isn't awaited** — `.action(() => { runInit(); })` is synchronous; the CLI can exit before group creation finishes and errors become unhandled rejections. Make it `async` and `await`. (`src/commands/init.ts`)
- [ ] **Uncaught errors crash the TUI** — init_flow rethrows non-rate-limit errors, and `index.ts` has no try/catch around flows. One throw kills the whole loop with a stack trace. Wrap actions in try/catch. (`src/index.ts`)
- [ ] **`generateKey()` is dead code** — create_group_flow generates its own key via `randomBytes`. Also its API is inconsistent (returns hex string, `encryptFile` takes a Buffer). Remove or unify. (`src/core/enc_dec_file.ts:6`)
- [ ] **Duplicated `listGroups()`** — copy-pasted in 5 files while `files.ts:listGroups` exists. Import it instead. (`src/flows/add_flow.ts`, `sync_flow.ts`, `sync_up_flow.ts`, `update_keys_flow.ts`, `track_flow.ts`)

## Design

- [ ] **Tracked paths aren't portable** — config.toml stores `path` relative to the local cwd. A collaborator who clones elsewhere will encrypt/decrypt the wrong files.
- [ ] **Inconsistent error model** — flows return `"error"|"cancelled"`, init returns `void` and rethrows. Commands map result→exit code inconsistently (init never exits nonzero on real failure).
- [ ] **No tests** — `npm test` is a stub. The crypto round-trip in `src/test/decryptall.ts` should be a real test.
