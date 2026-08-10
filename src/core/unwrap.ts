import * as path from "node:path";
import { loadIdentity } from "./age_store.js";
import { unsealFileKey } from "./age_keys.js";
import { readUserKeys } from "./user_keys.js";
import { findLocalSshIdentities } from "./ssh_to_age.js";

export async function unwrapGroupKey(groupName: string): Promise<string | null> {
  const groupDir = path.join(process.cwd(), "nspt", groupName);
  const userKeys = readUserKeys(groupDir);
  if (!userKeys) return null;

  const identities: string[] = [];
  const local = await findLocalSshIdentities();
  for (const id of local) identities.push(id.identity);
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
