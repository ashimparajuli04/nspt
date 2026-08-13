import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  readUserKeys,
  writeUserKeys,
  addUserKey,
  removeUser,
  listUsers,
  getUserKeys,
} from "../core/user_keys.js";
import type { UserKeysFile } from "../types.js";

const GROUP_DIR = "grp";

function makeData(): UserKeysFile {
  return {
    key_version: 1,
    users: [
      { username: "alice", keys: [{ age: "age1alice", ssh: "ssh-ed25519 alice", wrapped: "wrap-a" }] },
    ],
  };
}

test("write/read round trip preserves key_version and all key fields", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nspt-ukeys-"));
  try {
    fs.mkdirSync(path.join(dir, GROUP_DIR));
    writeUserKeys(path.join(dir, GROUP_DIR), makeData());
    const read = readUserKeys(path.join(dir, GROUP_DIR));
    assert.ok(read);
    assert.equal(read.key_version, 1);
    assert.deepEqual(read, makeData());
    assert.ok(fs.readFileSync(path.join(dir, GROUP_DIR, "user_keys.toml"), "utf8").includes("# nspt user keys"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("read: missing file returns null", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nspt-ukeys-"));
  try {
    fs.mkdirSync(path.join(dir, GROUP_DIR));
    assert.equal(readUserKeys(path.join(dir, GROUP_DIR)), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("read: normalizes empty and junk files", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nspt-ukeys-"));
  try {
    fs.mkdirSync(path.join(dir, GROUP_DIR));
    fs.writeFileSync(path.join(dir, GROUP_DIR, "user_keys.toml"), "");
    const read = readUserKeys(path.join(dir, GROUP_DIR));
    assert.ok(read);
    assert.equal(read.key_version, 1);
    assert.deepEqual(read.users, []);

    fs.writeFileSync(path.join(dir, GROUP_DIR, "user_keys.toml"), "not = toml [[[");
    assert.equal(readUserKeys(path.join(dir, GROUP_DIR)), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("addUserKey: adds a new user and duplicates are rejected", () => {
  const data = makeData();
  assert.equal(
    addUserKey(data, "bob", { age: "age1bob", ssh: "ssh-ed25519 bob", wrapped: "wrap-b" }),
    true
  );
  assert.equal(data.users.length, 2);
  assert.deepEqual(listUsers(data), ["alice", "bob"]);

  assert.equal(
    addUserKey(data, "bob", { age: "age1bob2", ssh: "ssh-ed25519 bob", wrapped: "wrap-b2" }),
    false,
    "same ssh key is a duplicate"
  );
  assert.equal(
    addUserKey(data, "bob", { age: "age1bob", ssh: "ssh-ed25519 bob2", wrapped: "wrap-b2" }),
    false,
    "same age key is a duplicate"
  );
  assert.equal(data.users.find((u) => u.username === "bob")!.keys.length, 1);
});

test("removeUser: removes the right user only", () => {
  const data = makeData();
  addUserKey(data, "bob", { age: "age1bob", ssh: "ssh", wrapped: "w" });
  assert.equal(removeUser(data, "alice"), true);
  assert.deepEqual(listUsers(data), ["bob"]);
  assert.equal(removeUser(data, "nobody"), false);
});

test("getUserKeys: returns the user or undefined", () => {
  const data = makeData();
  assert.equal(getUserKeys(data, "alice")?.username, "alice");
  assert.equal(getUserKeys(data, "nobody"), undefined);
});