import assert from "node:assert/strict";
import test from "node:test";

import { isSmallStoreStrictMode } from "./runtime-flags";

function withEnv(
  key: string,
  value: string | undefined,
  run: () => void | Promise<void>
) {
  const previous = process.env[key];
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }

  return Promise.resolve(run()).finally(() => {
    if (previous === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = previous;
    }
  });
}

test("isSmallStoreStrictMode defaults to true when env is unset", async () => {
  await withEnv("POS_SMALL_STORE_STRICT", undefined, () => {
    assert.equal(isSmallStoreStrictMode(), true);
  });
});

test("isSmallStoreStrictMode reads explicit env values", async () => {
  await withEnv("POS_SMALL_STORE_STRICT", "true", () => {
    assert.equal(isSmallStoreStrictMode(), true);
  });

  await withEnv("POS_SMALL_STORE_STRICT", "false", () => {
    assert.equal(isSmallStoreStrictMode(), false);
  });
});
