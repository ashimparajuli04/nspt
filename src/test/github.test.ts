import { test } from "node:test";
import assert from "node:assert/strict";
import { parseKeysBody } from "../core/github.js";

test("parseKeysBody: parses authorized_keys lines and drops comments", () => {
  const body = [
    "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFooBarBaz user@laptop",
    "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAAAgQC-abc= a title with spaces",
    "ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBG9= no-comment",
    "",
    "   ",
    "not a key line",
  ].join("\n");

  const keys = parseKeysBody(body);
  assert.equal(keys.length, 3);
  assert.equal(keys[0]!.key, "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFooBarBaz");
  assert.equal(keys[0]!.title, "user@laptop");
  assert.equal(keys[1]!.key, "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAAAgQC-abc=");
  assert.equal(keys[1]!.title, "a title with spaces");
  assert.equal(keys[2]!.title, "no-comment");
});

test("parseKeysBody: handles tabs and a missing trailing newline", () => {
  const keys = parseKeysBody("ssh-ed25519 AAAABase64\tmulti\tpart");
  assert.equal(keys.length, 1);
  assert.equal(keys[0]!.key, "ssh-ed25519 AAAABase64");
  assert.equal(keys[0]!.title, "multi part");
});

test("parseKeysBody: a key without a title gets an empty title", () => {
  const keys = parseKeysBody("ssh-ed25519 AAAABase64");
  assert.equal(keys.length, 1);
  assert.equal(keys[0]!.key, "ssh-ed25519 AAAABase64");
  assert.equal(keys[0]!.title, "");
});

test("parseKeysBody: empty and junk bodies yield no keys", () => {
  assert.equal(parseKeysBody("").length, 0);
  assert.equal(parseKeysBody("just-a-single-token").length, 0);
});
