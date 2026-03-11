import assert from "node:assert/strict";
import test from "node:test";

import { createSessionToken, getHomePathForRole, verifySessionToken } from "./auth";

function withEnv(
  values: Record<string, string | undefined>,
  run: () => void | Promise<void>
) {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  return Promise.resolve(run()).finally(() => {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });
}

test("createSessionToken rejects default auth secret in production", async () => {
  await withEnv({ NODE_ENV: "production", AUTH_SECRET: undefined }, async () => {
    await assert.rejects(
      () =>
        createSessionToken({
          userId: "u1",
          email: "sales@example.com",
          role: "SALES",
        }),
      /AUTH_SECRET/
    );
  });
});

test("session token roundtrip works with explicit auth secret", async () => {
  await withEnv({ NODE_ENV: "production", AUTH_SECRET: "test-secret-value-123" }, async () => {
    const token = await createSessionToken({
      userId: "u2",
      email: "owner@example.com",
      role: "OWNER",
    });
    const session = await verifySessionToken(token);

    assert.equal(session?.userId, "u2");
    assert.equal(session?.email, "owner@example.com");
    assert.equal(session?.role, "OWNER");
  });
});

test("getHomePathForRole keeps owner dashboard in strict mode", async () => {
  await withEnv({ POS_SMALL_STORE_STRICT: "true" }, async () => {
    assert.equal(getHomePathForRole("OWNER"), "/owner");
    assert.equal(getHomePathForRole("MANAGER"), "/sales");
    assert.equal(getHomePathForRole("SALES"), "/sales");
  });
});

test("getHomePathForRole keeps owner dashboard when strict mode is off", async () => {
  await withEnv({ POS_SMALL_STORE_STRICT: "false" }, async () => {
    assert.equal(getHomePathForRole("OWNER"), "/owner");
    assert.equal(getHomePathForRole("MANAGER"), "/sales");
    assert.equal(getHomePathForRole("SALES"), "/sales");
  });
});
