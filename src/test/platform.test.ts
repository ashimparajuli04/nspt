import { test } from "node:test";
import assert from "node:assert/strict";
import * as path from "node:path";
import { detectOs, generateHelp, sshDir, sshKeyPath } from "../core/platform.js";

test("detectOs: returns a known OS name", () => {
  const os = detectOs();
  assert.ok(["macos", "linux", "windows", "other"].includes(os));
});

test("sshDir: points at .ssh inside the home directory", () => {
  assert.ok(sshDir().endsWith(path.join(".ssh")));
  assert.ok(sshKeyPath().endsWith(path.join(".ssh", "id_ed25519")));
});

test("generateHelp: includes generation and GitHub instructions for every OS", () => {
  for (const os of ["macos", "linux", "windows", "other"] as const) {
    const help = generateHelp(os);
    assert.ok(help.includes("ssh-keygen -t ed25519"));
    assert.ok(help.includes("https://github.com/settings/ssh/new"));
    assert.ok(help.includes(".pub"));
  }
});
