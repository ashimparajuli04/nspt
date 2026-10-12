export interface UserKeyEntry {
  age: string;
  ssh: string;
  wrapped: string;
}

export interface UserEntry {
  username: string;
  keys: UserKeyEntry[];
}

export interface UserKeysFile {
  key_version: number;
  users: UserEntry[];
}

/**
 * A password-wrapped copy of a group's file key. Stored in a group's
 * `recovery.toml` (committed, so recovery works from a fresh clone) and keyed
 * by the member who set the password.
 */
export interface RecoveryEntry {
  username: string;
  /** sha256 of the file key this wrap holds, used to detect staleness. */
  fingerprint: string;
  wrapped: string;
}

export interface RecoveryFile {
  version: number;
  entries: RecoveryEntry[];
}

export type { SshPublicKey } from "./core/ssh_keys.js";
