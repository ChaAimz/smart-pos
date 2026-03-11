const MAX_IDEMPOTENCY_KEY_LENGTH = 128;

export function normalizeIdempotencyKey(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const key = value.trim();
  if (!key) {
    return null;
  }
  if (key.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    return null;
  }

  // Allow common key format characters only.
  if (!/^[A-Za-z0-9:_\-./]+$/.test(key)) {
    return null;
  }

  return key;
}
