import { Coins, Palette, Target } from "lucide-react";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { OwnerShell } from "@/components/layout/owner-shell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { FlashToast } from "@/components/ui/flash-toast";
import { Input } from "@/components/ui/input";
import { requireOwnerSession } from "@/lib/owner-session";
import { prisma } from "@/lib/prisma";
import {
  formatCurrencyFromCents,
  getStoreCurrencyOptions,
  type StoreCurrencyCode,
} from "@/lib/currency";
import {
  getMonthlySalesGoalCents,
  getStoreCurrencyCode,
  getThemePrimaryHex,
  upsertMonthlySalesGoalCents,
  upsertStoreCurrencyCode,
  upsertThemePrimaryHex,
} from "@/lib/store-setting";

type OwnerSettingsPageProps = {
  searchParams: Promise<{
    error?: string;
    status?: string;
  }>;
};

type OwnerSettingsData = {
  currencyCode: StoreCurrencyCode;
  dbStatus: "up" | "down";
  monthlyGoalCents: number;
  themePrimaryHex: string;
};

const statusMessages: Record<string, string> = {
  currency_saved: "Currency saved.",
  goal_saved: "Monthly revenue goal saved.",
  theme_saved: "Theme color saved.",
};

const errorMessages: Record<string, string> = {
  invalid_monthly_goal: "Please enter a valid monthly goal.",
  invalid_currency: "Please choose a supported currency.",
  invalid_theme_color: "Please pick a valid theme color.",
  currency_save_failed: "Unable to save currency right now.",
  goal_save_failed: "Unable to save monthly goal right now.",
  theme_save_failed: "Unable to save theme color right now.",
};

const themePresets: Array<{ label: string; value: string }> = [
  { label: "Default", value: "#111315" },
  { label: "Ocean", value: "#0F766E" },
  { label: "Forest", value: "#166534" },
  { label: "Ruby", value: "#9F1239" },
  { label: "Amber", value: "#A16207" },
];

async function updateMonthlyGoalAction(formData: FormData) {
  "use server";

  await requireOwnerSession();
  const rawValue = String(formData.get("monthlyGoalAmount") ?? "").trim();
  const monthlyGoalAmount = Number(rawValue);

  if (!Number.isFinite(monthlyGoalAmount) || monthlyGoalAmount < 0) {
    redirect("/owner/settings?error=invalid_monthly_goal");
  }

  const monthlySalesGoalCents = Math.round(monthlyGoalAmount * 100);

  try {
    await upsertMonthlySalesGoalCents(monthlySalesGoalCents);
  } catch {
    redirect("/owner/settings?error=goal_save_failed");
  }

  revalidatePath("/");
  revalidatePath("/owner");
  revalidatePath("/owner/settings");
  revalidatePath("/sales");
  redirect("/owner/settings?status=goal_saved");
}

async function updateCurrencyAction(formData: FormData) {
  "use server";

  await requireOwnerSession();
  const currencyCode = String(formData.get("currencyCode") ?? "").trim();

  if (!["USD", "THB", "ZAR"].includes(currencyCode)) {
    redirect("/owner/settings?error=invalid_currency");
  }

  try {
    await upsertStoreCurrencyCode(currencyCode);
  } catch {
    redirect("/owner/settings?error=currency_save_failed");
  }

  revalidatePath("/");
  revalidatePath("/owner");
  revalidatePath("/owner/reports");
  revalidatePath("/owner/products");
  revalidatePath("/owner/activity");
  revalidatePath("/owner/settings");
  revalidatePath("/sales");
  redirect("/owner/settings?status=currency_saved");
}

async function updateThemeAction(formData: FormData) {
  "use server";

  await requireOwnerSession();
  const rawPreset = String(formData.get("presetThemePrimaryHex") ?? "").trim();
  const rawPicker = String(formData.get("themePrimaryHex") ?? "").trim();
  const colorValue = rawPreset || rawPicker;

  if (!/^#[0-9A-Fa-f]{6}$/.test(colorValue)) {
    redirect("/owner/settings?error=invalid_theme_color");
  }

  try {
    await upsertThemePrimaryHex(colorValue);
  } catch {
    redirect("/owner/settings?error=theme_save_failed");
  }

  revalidatePath("/", "layout");
  revalidatePath("/");
  revalidatePath("/owner");
  revalidatePath("/owner/settings");
  revalidatePath("/sales");
  redirect("/owner/settings?status=theme_saved");
}

async function getOwnerSettingsData(): Promise<OwnerSettingsData> {
  const [monthlyGoalCents, themePrimaryHex, currencyCode] = await Promise.all([
    getMonthlySalesGoalCents(),
    getThemePrimaryHex(),
    getStoreCurrencyCode(),
  ]);

  try {
    await prisma.$queryRaw`SELECT 1`;
    return {
      dbStatus: "up",
      currencyCode,
      monthlyGoalCents,
      themePrimaryHex,
    };
  } catch {
    return {
      dbStatus: "down",
      currencyCode,
      monthlyGoalCents,
      themePrimaryHex,
    };
  }
}

export default async function OwnerSettingsPage({ searchParams }: OwnerSettingsPageProps) {
  const sessionUser = await requireOwnerSession();
  const params = await searchParams;
  const data = await getOwnerSettingsData();

  const statusMessage = params.status ? statusMessages[params.status] : undefined;
  const errorMessage = params.error ? errorMessages[params.error] : undefined;
  const currencyOptions = getStoreCurrencyOptions();
  const monthlyGoalLabelAmount = formatCurrencyFromCents(data.monthlyGoalCents, data.currencyCode);

  return (
    <OwnerShell
      activeNav="settings"
      dbStatus={data.dbStatus}
      pageTitle="Settings"
      userEmail={sessionUser.email}
    >
      <FlashToast
        id={params.status ? `owner-settings-status:${params.status}` : undefined}
        message={statusMessage}
        variant="success"
      />
      <FlashToast
        id={params.error ? `owner-settings-error:${params.error}` : undefined}
        message={errorMessage}
        variant="error"
      />

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="gap-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Coins className="size-4 text-muted-foreground" aria-hidden="true" />
              Currency
            </CardTitle>
            <CardDescription>
              Choose the currency used across dashboard, sales, products, and reports.
            </CardDescription>
          </CardHeader>
          <div className="border-t" />
          <CardContent className="pt-4">
            <form action={updateCurrencyAction}>
              <FieldGroup className="gap-4">
                <Field className="gap-2">
                  <FieldLabel htmlFor="currencyCode">Store currency</FieldLabel>
                  <select
                    id="currencyCode"
                    name="currencyCode"
                    defaultValue={data.currencyCode}
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {currencyOptions.map((option) => (
                      <option key={option.code} value={option.code}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <FieldDescription>
                    Current goal display: {monthlyGoalLabelAmount}
                  </FieldDescription>
                </Field>
                <div className="flex justify-end">
                  <Button type="submit">Save Currency</Button>
                </div>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>

        <Card className="gap-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Target className="size-4 text-muted-foreground" aria-hidden="true" />
              Monthly Goal Setting
            </CardTitle>
            <CardDescription>
              Set the monthly revenue target used by owner and sales progress indicators.
            </CardDescription>
          </CardHeader>
          <div className="border-t" />
          <CardContent className="pt-4">
            <form action={updateMonthlyGoalAction}>
              <FieldGroup className="gap-4">
                <Field className="gap-2">
                  <FieldLabel htmlFor="monthlyGoalAmount">Monthly goal amount</FieldLabel>
                  <Input
                    id="monthlyGoalAmount"
                    name="monthlyGoalAmount"
                    type="number"
                    min={0}
                    step="0.01"
                    defaultValue={(data.monthlyGoalCents / 100).toFixed(2)}
                    required
                  />
                  <FieldDescription>
                    This goal drives the Sales dashboard daily target and month progress values in{" "}
                    {data.currencyCode}.
                  </FieldDescription>
                </Field>
                <div className="flex justify-end">
                  <Button type="submit">Save Goal</Button>
                </div>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>

        <Card className="gap-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Palette className="size-4 text-muted-foreground" aria-hidden="true" />
              Theme Color
            </CardTitle>
            <CardDescription>
              Choose the primary color for buttons, badges, and interactive highlights.
            </CardDescription>
          </CardHeader>
          <div className="border-t" />
          <CardContent className="pt-4">
            <form action={updateThemeAction}>
              <FieldGroup className="gap-4">
                <Field className="gap-2">
                  <FieldLabel htmlFor="themePrimaryHex">Primary color</FieldLabel>
                  <div className="flex items-center gap-3">
                    <Input
                      id="themePrimaryHex"
                      name="themePrimaryHex"
                      type="color"
                      defaultValue={data.themePrimaryHex}
                      className="h-10 w-16 cursor-pointer p-1"
                    />
                    <div className="inline-flex items-center rounded-md border border-border bg-muted px-2 py-1 text-sm font-medium">
                      {data.themePrimaryHex}
                    </div>
                  </div>
                  <FieldDescription>
                    The selected color applies globally after saving.
                  </FieldDescription>
                </Field>

                <div className="flex flex-wrap gap-2">
                  {themePresets.map((preset) => (
                    <Button
                      key={preset.value}
                      type="submit"
                      name="presetThemePrimaryHex"
                      value={preset.value}
                      variant={preset.value === data.themePrimaryHex ? "default" : "outline"}
                      className="gap-2"
                    >
                      <span
                        className="size-3 rounded-sm border border-black/20"
                        style={{ backgroundColor: preset.value }}
                        aria-hidden="true"
                      />
                      {preset.label}
                    </Button>
                  ))}
                </div>

                <div className="flex justify-end">
                  <Button type="submit">Save Custom Color</Button>
                </div>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
      </section>
    </OwnerShell>
  );
}
