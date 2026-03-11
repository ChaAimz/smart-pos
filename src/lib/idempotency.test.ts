import assert from "node:assert/strict";
import test from "node:test";

import { normalizeIdempotencyKey } from "./idempotency";

test("normalizeIdempotencyKey accepts valid keys", () => {
  assert.equal(normalizeIdempotencyKey("sale_123"), "sale_123");
  assert.equal(normalizeIdempotencyKey("  sale:abc-123  "), "sale:abc-123");
});

test("normalizeIdempotencyKey rejects invalid keys", () => {
  assert.equal(normalizeIdempotencyKey(null), null);
  assert.equal(normalizeIdempotencyKey(""), null);
  assert.equal(normalizeIdempotencyKey(" "), null);
  assert.equal(normalizeIdempotencyKey("sale key"), null);
  assert.equal(normalizeIdempotencyKey("x".repeat(129)), null);
});
