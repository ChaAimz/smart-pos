export const STORE_CURRENCY_CODES = ["USD", "THB", "ZAR"] as const;
export type StoreCurrencyCode = (typeof STORE_CURRENCY_CODES)[number];

export const DEFAULT_STORE_CURRENCY_CODE: StoreCurrencyCode = "ZAR";

const CURRENCY_LABELS: Record<StoreCurrencyCode, string> = {
  USD: "US Dollar ($)",
  THB: "Thai Baht (฿)",
  ZAR: "South African rand (R)",
};

export function normalizeStoreCurrencyCode(value: string | null | undefined): StoreCurrencyCode {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase();

  if (normalized === "USD" || normalized === "THB" || normalized === "ZAR") {
    return normalized;
  }

  return DEFAULT_STORE_CURRENCY_CODE;
}

export function getStoreCurrencyOptions() {
  return STORE_CURRENCY_CODES.map((code) => ({
    code,
    label: CURRENCY_LABELS[code],
  }));
}

export function formatCurrencyFromCents(
  cents: number,
  currencyCode: StoreCurrencyCode,
  options?: {
    locale?: string;
    maximumFractionDigits?: number;
    minimumFractionDigits?: number;
  }
) {
  const locale = options?.locale ?? "en-US";

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: options?.maximumFractionDigits,
    minimumFractionDigits: options?.minimumFractionDigits,
  }).format(cents / 100);
}
