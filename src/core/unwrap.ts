import * as fs from "node:fs";
import * as path from "node:path";
import { loadIdentity } from "./age_store.js";
import { unsealFileKey } from "./age_keys.js";
import { readUserKeys } from "./user_keys.js";

export async function unwrapGroupKey(groupName: string): Promise<string | null> {
  const groupDir = path.join(process.cwd(), "nspt", groupName);
  const identity = loadIdentity(groupName);
  if (!identity) return null;

  const userKeys = readUserKeys(groupDir);
  if (!userKeys) return null;

  for (const user of userKeys.users) {
    for (const entry of user.keys) {
      const key = await unsealFileKey(entry.wrapped, identity);
      if (key) return key;
    }
  }
  return null;
}
