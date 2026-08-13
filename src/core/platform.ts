import * as path from "node:path";
import { homedir } from "node:os";

export type OsName = "macos" | "linux" | "windows" | "other";

export function detectOs(): OsName {
  switch (process.platform) {
    case "darwin":
      return "macos";
    case "linux":
      return "linux";
    case "win32":
      return "windows";
    default:
      return "other";
  }
}

export function sshDir(): string {
  return path.join(homedir(), ".ssh");
}

export function sshKeyPath(): string {
  return path.join(sshDir(), "id_ed25519");
}

export function generateHelp(os: OsName = detectOs()): string {
  const keyPath = sshKeyPath();
  const lines: string[] = [];

  switch (os) {
    case "macos":
      lines.push(
        "No ssh-ed25519 key found in your SSH config.",
        "",
        "Generate one now:",
        `  ssh-keygen -t ed25519 -C "your_email@example.com" -f ${keyPath} -N ""`,
        `  ssh-add --apple-use-keychain ${keyPath}`,
        "",
        "Your public key will be at:",
        `  ${keyPath}.pub`,
        "",
        "Then add it to GitHub so nspt can verify your identity:",
        "  https://github.com/settings/ssh/new"
      );
      break;
    case "linux":
      lines.push(
        "No ssh-ed25519 key found in your SSH config.",
        "",
        "Generate one now:",
        `  ssh-keygen -t ed25519 -C "your_email@example.com" -f ${keyPath} -N ""`,
        `  ssh-add ${keyPath}`,
        "",
        "Your public key will be at:",
        `  ${keyPath}.pub`,
        "",
        "Then add it to GitHub so nspt can verify your identity:",
        "  https://github.com/settings/ssh/new"
      );
      break;
    case "windows":
      lines.push(
        "No ssh-ed25519 key found in your SSH config.",
        "",
        "Generate one now (in PowerShell or Git Bash):",
        `  ssh-keygen -t ed25519 -C "your_email@example.com" -f ${keyPath} -N ""`,
        `  ssh-add ${keyPath}`,
        "",
        "Your public key will be at:",
        `  ${keyPath}.pub`,
        "",
        "Then add it to GitHub so nspt can verify your identity:",
        "  https://github.com/settings/ssh/new"
      );
      break;
    default:
      lines.push(
        "No ssh-ed25519 key found in your SSH config.",
        "",
        "Generate one now:",
        `  ssh-keygen -t ed25519 -C "your_email@example.com" -f ${keyPath} -N ""`,
        `  ssh-add ${keyPath}`,
        "",
        "Your public key will be at:",
        `  ${keyPath}.pub`,
        "",
        "Then add it to GitHub so nspt can verify your identity:",
        "  https://github.com/settings/ssh/new"
      );
      break;
  }

  return lines.join("\n");
}