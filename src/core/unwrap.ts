import * as path from "node:path";
import { loadIdentity } from "./age_store.js";
import { unsealFileKey } from "./age_keys.js";
import { readUserKeys } from "./user_keys.js";
import { findEncryptedLocalKeys } from "./ssh_keys.js";
import { findLocalSshIdentities, sshIdentityWithPassphrase } from "./ssh_to_age.js";

export interface UnwrapOptions {
  getPassphrase?: (keyPath: string) => Promise<string | null>;
}

export async function unwrapGroupKey(
  groupName: string,
  options: UnwrapOptions = {}
): Promise<string | null> {
  const groupDir = path.join(process.cwd(), "nspt", groupName);
  const userKeys = readUserKeys(groupDir);
  if (!userKeys) return null;

  const identities: string[] = [];
  const local = await findLocalSshIdentities();
  for (const id of local) identities.push(id.identity);

  if (options.getPassphrase) {
    const encrypted = await findEncryptedLocalKeys();
    for (const key of encrypted) {
      const passphrase = await options.getPassphrase(key.source);
      if (!passphrase) continue;
      const id = sshIdentityWithPassphrase(key.source, passphrase);
      if (id) identities.push(id.identity);
    }
  }

  const legacy = loadIdentity(groupName);
  if (legacy) identities.push(legacy);

  for (const identity of identities) {
    for (const user of userKeys.users) {
      for (const entry of user.keys) {
        const key = await unsealFileKey(entry.wrapped, identity);
        if (key) return key;
      }
    }
  }
  return null;
}
