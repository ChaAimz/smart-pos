import { prisma } from "@/lib/prisma";
import {
  DEFAULT_STORE_CURRENCY_CODE,
  normalizeStoreCurrencyCode,
  type StoreCurrencyCode,
} from "@/lib/currency";

const DEFAULT_STORE_SETTING_ID = "default";
const DEFAULT_THEME_PRIMARY_HEX = "#111315";
const THEME_PRIMARY_HEX_PATTERN = /^#[0-9A-F]{6}$/;

type StoreSettingFindUniqueArgs = {
  where: { id: string };
  select: {
    monthlySalesGoalCents?: true;
    themePrimaryHex?: true;
    currencyCode?: true;
  };
};

type StoreSettingUpsertArgs = {
  where: { id: string };
  update: {
    monthlySalesGoalCents?: number;
    themePrimaryHex?: string;
    currencyCode?: string;
  };
  create: {
    id: string;
    monthlySalesGoalCents?: number;
    themePrimaryHex?: string;
    currencyCode?: string;
  };
};

type StoreSettingDelegate = {
  findUnique: (
    args: StoreSettingFindUniqueArgs
  ) => Promise<{ monthlySalesGoalCents?: number; themePrimaryHex?: string; currencyCode?: string } | null>;
  upsert: (args: StoreSettingUpsertArgs) => Promise<unknown>;
};

function getStoreSettingDelegate() {
  return (prisma as typeof prisma & { storeSetting?: Partial<StoreSettingDelegate> }).storeSetting;
}

export function normalizeThemePrimaryHex(value: string) {
  const normalized = value.trim().toUpperCase();
  return THEME_PRIMARY_HEX_PATTERN.test(normalized) ? normalized : DEFAULT_THEME_PRIMARY_HEX;
}

export async function getMonthlySalesGoalCents() {
  const delegate = getStoreSettingDelegate();

  if (delegate && typeof delegate.findUnique === "function") {
    const setting = await delegate.findUnique({
      where: {
        id: DEFAULT_STORE_SETTING_ID,
      },
      select: {
        monthlySalesGoalCents: true,
      },
    });

    return setting?.monthlySalesGoalCents ?? 0;
  }

  try {
    const rows = await prisma.$queryRaw<Array<{ monthlySalesGoalCents: number }>>`
      SELECT "monthlySalesGoalCents"
      FROM "StoreSetting"
      WHERE "id" = ${DEFAULT_STORE_SETTING_ID}
      LIMIT 1
    `;

    return rows[0]?.monthlySalesGoalCents ?? 0;
  } catch {
    return 0;
  }
}

export async function upsertMonthlySalesGoalCents(monthlySalesGoalCents: number) {
  const delegate = getStoreSettingDelegate();

  if (delegate && typeof delegate.upsert === "function") {
    await delegate.upsert({
      where: {
        id: DEFAULT_STORE_SETTING_ID,
      },
      update: {
        monthlySalesGoalCents,
      },
      create: {
        id: DEFAULT_STORE_SETTING_ID,
        monthlySalesGoalCents,
      },
    });
    return;
  }

  await prisma.$executeRaw`
    INSERT INTO "StoreSetting" ("id", "monthlySalesGoalCents", "createdAt", "updatedAt")
    VALUES (${DEFAULT_STORE_SETTING_ID}, ${monthlySalesGoalCents}, NOW(), NOW())
    ON CONFLICT ("id")
    DO UPDATE
    SET "monthlySalesGoalCents" = EXCLUDED."monthlySalesGoalCents",
        "updatedAt" = NOW()
  `;
}

export async function getThemePrimaryHex() {
  const delegate = getStoreSettingDelegate();

  if (delegate && typeof delegate.findUnique === "function") {
    try {
      const setting = await delegate.findUnique({
        where: {
          id: DEFAULT_STORE_SETTING_ID,
        },
        select: {
          themePrimaryHex: true,
        },
      });

      return normalizeThemePrimaryHex(setting?.themePrimaryHex ?? DEFAULT_THEME_PRIMARY_HEX);
    } catch {
      // Fall through to SQL path when Prisma client is not yet regenerated.
    }
  }

  try {
    const rows = await prisma.$queryRaw<Array<{ themePrimaryHex: string | null }>>`
      SELECT "themePrimaryHex"
      FROM "StoreSetting"
      WHERE "id" = ${DEFAULT_STORE_SETTING_ID}
      LIMIT 1
    `;

    return normalizeThemePrimaryHex(rows[0]?.themePrimaryHex ?? DEFAULT_THEME_PRIMARY_HEX);
  } catch {
    return DEFAULT_THEME_PRIMARY_HEX;
  }
}

export async function upsertThemePrimaryHex(themePrimaryHex: string) {
  const normalizedThemePrimaryHex = normalizeThemePrimaryHex(themePrimaryHex);
  const delegate = getStoreSettingDelegate();

  if (delegate && typeof delegate.upsert === "function") {
    try {
      await delegate.upsert({
        where: {
          id: DEFAULT_STORE_SETTING_ID,
        },
        update: {
          themePrimaryHex: normalizedThemePrimaryHex,
        },
        create: {
          id: DEFAULT_STORE_SETTING_ID,
          themePrimaryHex: normalizedThemePrimaryHex,
        },
      });
      return;
    } catch {
      // Fall through to SQL path when Prisma client is not yet regenerated.
    }
  }

  await prisma.$executeRaw`
    INSERT INTO "StoreSetting" ("id", "themePrimaryHex", "createdAt", "updatedAt")
    VALUES (${DEFAULT_STORE_SETTING_ID}, ${normalizedThemePrimaryHex}, NOW(), NOW())
    ON CONFLICT ("id")
    DO UPDATE
    SET "themePrimaryHex" = EXCLUDED."themePrimaryHex",
        "updatedAt" = NOW()
  `;
}

export async function getStoreCurrencyCode(): Promise<StoreCurrencyCode> {
  const delegate = getStoreSettingDelegate();

  if (delegate && typeof delegate.findUnique === "function") {
    try {
      const setting = await delegate.findUnique({
        where: {
          id: DEFAULT_STORE_SETTING_ID,
        },
        select: {
          currencyCode: true,
        },
      });

      return normalizeStoreCurrencyCode(setting?.currencyCode);
    } catch {
      // Fall through to SQL path when Prisma client is not yet regenerated.
    }
  }

  try {
    const rows = await prisma.$queryRaw<Array<{ currencyCode: string | null }>>`
      SELECT "currencyCode"
      FROM "StoreSetting"
      WHERE "id" = ${DEFAULT_STORE_SETTING_ID}
      LIMIT 1
    `;

    return normalizeStoreCurrencyCode(rows[0]?.currencyCode);
  } catch {
    return DEFAULT_STORE_CURRENCY_CODE;
  }
}

export async function upsertStoreCurrencyCode(currencyCode: string) {
  const normalizedCurrencyCode = normalizeStoreCurrencyCode(currencyCode);
  const delegate = getStoreSettingDelegate();

  if (delegate && typeof delegate.upsert === "function") {
    try {
      await delegate.upsert({
        where: {
          id: DEFAULT_STORE_SETTING_ID,
        },
        update: {
          currencyCode: normalizedCurrencyCode,
        },
        create: {
          id: DEFAULT_STORE_SETTING_ID,
          currencyCode: normalizedCurrencyCode,
        },
      });
      return;
    } catch {
      // Fall through to SQL path when Prisma client is not yet regenerated.
    }
  }

  await prisma.$executeRaw`
    INSERT INTO "StoreSetting" ("id", "currencyCode", "createdAt", "updatedAt")
    VALUES (${DEFAULT_STORE_SETTING_ID}, ${normalizedCurrencyCode}, NOW(), NOW())
    ON CONFLICT ("id")
    DO UPDATE
    SET "currencyCode" = EXCLUDED."currencyCode",
        "updatedAt" = NOW()
  `;
}
