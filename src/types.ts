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

export type { SshPublicKey } from "./core/ssh_keys.js";
