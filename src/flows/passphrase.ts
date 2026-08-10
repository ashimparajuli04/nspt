import * as path from "node:path";
import * as p from "@clack/prompts";
import { sshIdentityWithPassphrase, type SshKeyIdentity } from "../core/ssh_to_age.js";

async function promptForPassphrase(
  keyPath: string,
  spinner: ReturnType<typeof p.spinner>,
  resumeMessage: string
): Promise<string | null> {
  for (;;) {
    spinner.stop();
    const value = await p.password({
      message: `Enter passphrase for ${path.basename(keyPath)}:`,
    });
    if (p.isCancel(value)) return null;
    if (!sshIdentityWithPassphrase(keyPath, value)) {
      p.log.error("Incorrect passphrase. Try again.");
      continue;
    }
    spinner.start(resumeMessage);
    return value;
  }
}

export function passphraseProvider(
  spinner: ReturnType<typeof p.spinner>
): (keyPath: string) => Promise<string | null> {
  return (keyPath) => promptForPassphrase(keyPath, spinner, "Unwrapping group key...");
}

export async function promptSshIdentity(
  keyPath: string,
  spinner: ReturnType<typeof p.spinner>
): Promise<SshKeyIdentity | null> {
  const passphrase = await promptForPassphrase(keyPath, spinner, "Generating group key...");
  if (!passphrase) return null;
  return sshIdentityWithPassphrase(keyPath, passphrase);
}
