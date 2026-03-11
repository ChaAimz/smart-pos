export function isSmallStoreStrictMode() {
  const configured = process.env.POS_SMALL_STORE_STRICT;
  if (configured == null) {
    return true;
  }

  return configured === "true";
}
