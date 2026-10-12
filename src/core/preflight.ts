import { getVerifiedUsername } from "./identity.js";
import { tallyKeys } from "./ssh_keys.js";
import { dryRun } from "./age_keys.js";

export interface PreflightResult {
  username: string;
  hasLocalMatch: boolean;
  githubEd25519Count: number;
}

export async function runPreflight(): Promise<PreflightResult | null> {
  // The age dry-run is independent of identity/key discovery, so start it now.
  const ageOkPromise = dryRun();

  const username = await getVerifiedUsername({ force: true });
  if (!username) {
    await ageOkPromise;
    return null;
  }

  const { matched, github } = await tallyKeys(username);
  const ed25519 = github.filter((k) => k.type === "ssh-ed25519");

  if (ed25519.length === 0) {
    await ageOkPromise;
    return null;
  }
  if (matched.length === 0) {
    await ageOkPromise;
    return null;
  }

  const ageOk = await ageOkPromise;
  if (!ageOk) return null;

  return {
    username,
    hasLocalMatch: matched.length > 0,
    githubEd25519Count: ed25519.length,
  };
}
