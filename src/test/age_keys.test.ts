import { test } from "node:test";
import assert from "node:assert/strict";
import { generateAgeIdentity, sealToFileKey, unsealFileKey, dryRun } from "../core/age_keys.js";
import { generateKey } from "../core/enc_dec_file.js";

test("generateAgeIdentity: produces native age identity and recipient", async () => {
  const { identity, recipient } = await generateAgeIdentity();
  assert.ok(identity.startsWith("AGE-SECRET-KEY-1"));
  assert.ok(recipient.startsWith("age1"));
});

test("sealToFileKey: every recipient can unseal independently", async () => {
  const alice = await generateAgeIdentity();
  const bob = await generateAgeIdentity();
  const fileKey = generateKey();

  const wrapped = await sealToFileKey(fileKey, [alice.recipient, bob.recipient]);
  assert.equal(wrapped.length, 2);

  assert.equal(await unsealFileKey(wrapped[0]!, alice.identity), fileKey);
  assert.equal(await unsealFileKey(wrapped[1]!, bob.identity), fileKey);
  assert.equal(await unsealFileKey(wrapped[0]!, bob.identity), null, "alice's wrap stays private to alice");
  assert.equal(await unsealFileKey(wrapped[1]!, alice.identity), null, "bob's wrap stays private to bob");
});

test("unsealFileKey: wrong identity and corrupted armor return null", async () => {
  const { identity, recipient } = await generateAgeIdentity();
  const fileKey = generateKey();
  const wrapped = (await sealToFileKey(fileKey, [recipient]))[0]!;

  const stranger = await generateAgeIdentity();
  assert.equal(await unsealFileKey(wrapped, stranger.identity), null);
  assert.equal(await unsealFileKey(wrapped + "tampered", identity), null);
});

test("dryRun: wraps and unwraps a real key", async () => {
  assert.equal(await dryRun(), true);
});