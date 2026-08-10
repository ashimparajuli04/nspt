# nspt — issues to fix

Work through these one by one. Check off when done.

## Security

- [x] **Path traversal via group name** — no validation on group names. `nspt create-group ../../foo` resolves outside `nspt/`, and `config.toml`/`user_keys.toml` get written wherever `path.join(process.cwd(), "nspt", groupName)` lands. Validate against `..`, `/`, and path separators. (`src/flows/create_group_flow.ts`) — **fixed**: `validateGroupName` rejects `/`, `\`, `..`, and empty names, applied to both CLI arg and TUI prompt; names are trimmed.
- [x] **config.toml trust = arbitrary file read/write** — `encryptAllTrackedFiles`/`decryptAllFiles` trust `files[].path` from config.toml, which lives in the git-synced repo. A collaborator who can push to the repo can point a path at `~/.bashrc` and `nspt sync` overwrites it with plaintext — or `sync-up` reads arbitrary local files. Validate paths: no absolute paths, no `..`, must stay under the repo root. (`src/core/enc_dec_file.ts`) — **fixed**: `isPathWithinRoot` resolves and verifies every tracked path stays under `process.cwd()`, enforced at track time (`track_flow`) and again at encrypt/decrypt time (`enc_dec_file.ts`) so tampered config.toml entries fail closed.
- [x] **`sync` writes plaintext permanently to disk** — decrypted secrets are written back to `file.path` and stay there. If the model is "secrets only exist transiently," this defeats it. Document or change. (`src/core/enc_dec_file.ts:75`) — **decided: intended (restore model)**. `sync` is meant to put env files back for local use; deleting a tracked file is the user's obligation to also remove it from config.toml, which `encryptFile` already enforces (throws if the tracked file is missing).

## Bugs

- [x] **`nspt init` isn't awaited** — `.action(() => { runInit(); })` is synchronous; the CLI can exit before group creation finishes and errors become unhandled rejections. Make it `async` and `await`. (`src/commands/init.ts`) — **fixed**: action is now `async` and awaits `runInit()`.
- [x] **Uncaught errors crash the TUI** — init_flow rethrows non-rate-limit errors, and `index.ts` has no try/catch around flows. One throw kills the whole loop with a stack trace. Wrap actions in try/catch. (`src/index.ts`) — **fixed**: TUI wraps the whole action switch in try/catch (logs error, returns to menu). Added `runCliAction` helper (`src/core/cli_action.ts`) — commander does NOT catch async action rejections (verified), so all 7 CLI commands now route through it: unexpected errors print a clean message and exit 1 instead of dumping a stack trace.
- [x] **`generateKey()` is dead code** — create_group_flow generates its own key via `randomBytes`. Also its API is inconsistent (returns hex string, `encryptFile` takes a Buffer). Remove or unify. (`src/core/enc_dec_file.ts:6`) — **fixed**: create_group_flow now uses `generateKey()` (single source of truth for key generation); removed the duplicated `randomBytes` call.
- [x] **Duplicated `listGroups()`** — copy-pasted in 5 files while `files.ts:listGroups` exists. Import it instead. (`src/flows/add_flow.ts`, `sync_flow.ts`, `sync_up_flow.ts`, `update_keys_flow.ts`, `track_flow.ts`) — **fixed**: removed the 4 local copies; all flows now import the shared `listGroups` from `files.ts` (track_flow already did).

## Design

- [x] **Tracked paths aren't portable** — config.toml stores `path` relative to the local cwd. A collaborator who clones elsewhere will encrypt/decrypt the wrong files. — **fixed**: track now normalizes every stored path to be relative to the nspt init dir (cwd) with forward slashes (`path.relative(cwd, filepath)` + separator normalization), so paths resolve correctly regardless of clone location.
- [x] **Inconsistent error model** — flows return `"error"|"cancelled"`, init returns `void` and rethrows. Commands map result→exit code inconsistently (init never exits nonzero on real failure). — **fixed**: `runInit` now returns `InitResult = "initialized"|"cancelled"|"error"` (no more rethrow — preflight errors caught and returned), so `nspt init` exits 1 on real failure through the same `runCliAction` path as every other command. All flows now share the same result-union convention.
- [ ] **No tests** — `npm test` is a stub. The crypto round-trip in `src/test/decryptall.ts` should be a real test.
