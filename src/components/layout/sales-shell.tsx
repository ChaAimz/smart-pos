import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Banknote,
  CalendarDays,
  Clock3,
  CreditCard,
  QrCode,
  Settings2,
  ShoppingCart,
  Target,
  Ticket,
  Type,
  UserRound,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { LogoutMenuItem } from "@/components/layout/logout-menu-item";
import { ContentShell } from "@/components/layout/content-shell";
import { AppBrand } from "@/components/layout/app-brand";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type WorkspaceMode = "sales" | "manage";

type SalesShellProps = {
  children: React.ReactNode;
  userEmail: string;
  todaySalesCount: number;
  todayRevenueCents: number;
  todayPaymentBreakdownCents: {
    cash: number;
    qrCode: number;
    creditCard: number;
  };
  thisMonthRevenueCents: number;
  monthlyGoalCents: number;
  todayGoalCents: number;
  todayProgressPct: number;
  monthProgressPct: number;
  isLargeText: boolean;
  shiftEnabled: boolean;
  isShiftOpen: boolean;
  workspaceMode: WorkspaceMode;
};

function formatPercent(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "0%";
  }

  const rounded = Math.round(value * 10) / 10;
  return `${rounded}%`;
}

function getProgressWidth(percent: number) {
  if (!Number.isFinite(percent) || percent <= 0) {
    return "0%";
  }

  return `${Math.min(percent, 100)}%`;
}

function TicketStatusIcon({ isLargeText }: { isLargeText: boolean }) {
  return (
    <Ticket
      className={cn("size-4 text-primary/90", isLargeText && "size-5")}
      strokeWidth={2.15}
      aria-hidden="true"
    />
  );
}

export function SalesShell({
  children,
  userEmail,
  todaySalesCount,
  todayRevenueCents,
  todayPaymentBreakdownCents,
  thisMonthRevenueCents,
  monthlyGoalCents,
  todayGoalCents,
  todayProgressPct,
  monthProgressPct,
  isLargeText,
  shiftEnabled,
  isShiftOpen,
  workspaceMode,
}: SalesShellProps) {
  const displayName = userEmail.split("@")[0];
  const initials = displayName.slice(0, 2).toUpperCase();
  const todayRevenue = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(todayRevenueCents / 100);
  const monthRevenue = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(thisMonthRevenueCents / 100);
  const monthGoal = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(monthlyGoalCents / 100);
  const todayGoal = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(todayGoalCents / 100);
  const salesModeHref = `/sales?mode=sales&text=${isLargeText ? "large" : "normal"}`;
  const manageModeHref = `/sales?mode=manage&text=${isLargeText ? "large" : "normal"}`;
  const toggleLargeTextHref = `/sales?mode=${workspaceMode}&text=${isLargeText ? "normal" : "large"}`;
  const paymentRows = [
    {
      label: "Cash",
      icon: Wallet,
      value: new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
        todayPaymentBreakdownCents.cash / 100
      ),
    },
    {
      label: "QR Code",
      icon: QrCode,
      value: new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
        todayPaymentBreakdownCents.qrCode / 100
      ),
    },
    {
      label: "Credit Card",
      icon: CreditCard,
      value: new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
        todayPaymentBreakdownCents.creditCard / 100
      ),
    },
  ] as const;
  const dailyGoalMet = todayGoalCents > 0 && todayRevenueCents >= todayGoalCents;
  const monthGoalMet = monthlyGoalCents > 0 && thisMonthRevenueCents >= monthlyGoalCents;
  const goalNote =
    monthlyGoalCents > 0 ? `Goal ${monthGoal}` : "No goal";
  const avatarMenuItemClass = cn(
    "gap-2 py-2",
    isLargeText && "py-2.5 text-base [&_svg]:size-5"
  );

  return (
    <div className="min-h-screen bg-background">
      <form id="sales-logout-form" action="/api/auth/logout" method="post" className="hidden" />
      <ContentShell
        headerClassName="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
        mainClassName="mx-auto w-full max-w-[1400px] px-4 pb-4 pt-2 md:px-6 md:pb-6 md:pt-3"
        header={
          <div className="mx-auto flex h-16 w-full max-w-[1400px] items-center gap-3 px-4 md:px-6">
            <AppBrand />
            <div className="ml-auto flex items-center gap-2">
              <TooltipProvider delayDuration={120}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      variant="secondary"
                      className={cn(
                        "hidden h-10 gap-2 rounded-full border border-border/60 bg-muted/70 px-4 text-sm text-foreground sm:inline-flex [&>svg]:size-4",
                        isLargeText && "h-11 px-5 text-base [&>svg]:size-5"
                      )}
                      aria-label={`Tickets ${todaySalesCount}`}
                    >
                      <TicketStatusIcon isLargeText={isLargeText} />
                      <span className={cn("text-base font-semibold tabular-nums", isLargeText && "text-lg")}>
                        {todaySalesCount}
                      </span>
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" sideOffset={8}>
                    Today tickets
                  </TooltipContent>
                </Tooltip>

                <Popover>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          className={cn(
                            "hidden h-10 rounded-full border-primary/25 bg-primary/10 px-4 text-sm text-primary hover:bg-primary/15 hover:text-primary md:inline-flex",
                            isLargeText && "h-11 px-5 text-base"
                          )}
                          aria-label="Open sales status details"
                        >
                          <Banknote className={cn("size-4", isLargeText && "size-5")} aria-hidden="true" />
                          <span className={cn("text-base font-semibold tabular-nums", isLargeText && "text-lg")}>
                            {todayRevenue}
                          </span>
                        </Button>
                      </PopoverTrigger>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" sideOffset={8}>
                      Open sales status
                    </TooltipContent>
                  </Tooltip>
                  <PopoverContent
                    align="end"
                    className={cn("w-96 p-0", isLargeText && "w-[30rem]")}
                  >
                    <div className="flex items-center justify-between p-4">
                      <p className={cn("flex items-center gap-2 text-base font-semibold", isLargeText && "text-lg")}>
                        <Banknote className={cn("size-4 text-primary", isLargeText && "size-5")} aria-hidden="true" />
                        Sales Status
                      </p>
                      <span className={cn("text-sm text-muted-foreground", isLargeText && "text-base")}>Today</span>
                    </div>
                    <div className="border-t" />
                    <div className="grid gap-2 p-4">
                      {paymentRows.map((row) => (
                        <div key={row.label} className="flex items-center justify-between gap-3">
                          <span
                            className={cn(
                              "inline-flex items-center gap-2 text-base text-muted-foreground",
                              isLargeText && "text-lg"
                            )}
                          >
                            <row.icon className={cn("size-4 text-primary", isLargeText && "size-5")} aria-hidden="true" />
                            {row.label}
                          </span>
                          <span className={cn("text-base font-semibold tabular-nums", isLargeText && "text-lg")}>
                            {row.value}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="border-t" />
                    <div className="grid gap-3 p-4">
                      <div className="grid gap-1.5">
                        <div className="flex items-center justify-between gap-3">
                          <span
                            className={cn(
                              "inline-flex items-center gap-2 text-base text-muted-foreground",
                              isLargeText && "text-lg"
                            )}
                          >
                            <Target className={cn("size-4 text-primary", isLargeText && "size-5")} aria-hidden="true" />
                            Today
                          </span>
                          <span className={cn("text-base font-semibold tabular-nums", isLargeText && "text-lg")}>
                            {formatPercent(todayProgressPct)}
                          </span>
                        </div>
                        <div className={cn("h-2.5 rounded-full bg-muted", isLargeText && "h-3")}>
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: getProgressWidth(todayProgressPct) }}
                          />
                        </div>
                        <div
                          className={cn(
                            "flex items-center justify-between gap-3 text-sm text-muted-foreground",
                            isLargeText && "text-base"
                          )}
                        >
                          <span>{todayRevenue} / {todayGoal}</span>
                          <span>{dailyGoalMet ? "Reached" : "Pending"}</span>
                        </div>
                      </div>

                      <div className="grid gap-1.5">
                        <div className="flex items-center justify-between gap-3">
                          <span
                            className={cn(
                              "inline-flex items-center gap-2 text-base text-muted-foreground",
                              isLargeText && "text-lg"
                            )}
                          >
                            <CalendarDays className={cn("size-4 text-primary", isLargeText && "size-5")} aria-hidden="true" />
                            Month
                          </span>
                          <span className={cn("text-base font-semibold tabular-nums", isLargeText && "text-lg")}>
                            {formatPercent(monthProgressPct)}
                          </span>
                        </div>
                        <div className={cn("h-2.5 rounded-full bg-muted", isLargeText && "h-3")}>
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: getProgressWidth(monthProgressPct) }}
                          />
                        </div>
                        <div
                          className={cn(
                            "flex items-center justify-between gap-3 text-sm text-muted-foreground",
                            isLargeText && "text-base"
                          )}
                        >
                          <span>{monthRevenue} / {monthGoal}</span>
                          <span>{monthGoalMet ? "Reached" : "Pending"}</span>
                        </div>
                      </div>
                      <p className={cn("text-sm text-muted-foreground", isLargeText && "text-base")}>
                        {goalNote}
                      </p>
                    </div>
                  </PopoverContent>
                </Popover>

                {shiftEnabled ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge
                        variant="outline"
                        className={cn(
                          "hidden rounded-full border-border/70 bg-background px-3 py-1 text-foreground sm:inline-flex",
                          isLargeText && "px-4 py-1.5 text-base"
                        )}
                      >
                        <Clock3 className={cn("size-4 text-primary", isLargeText && "size-5")} aria-hidden="true" />
                        {isShiftOpen ? "Open" : "Closed"}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" sideOffset={8}>
                      Shift status
                    </TooltipContent>
                  </Tooltip>
                ) : null}
              </TooltipProvider>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "size-10 rounded-full border-border/70 p-0",
                      isLargeText && "size-11"
                    )}
                  >
                    <Avatar size={isLargeText ? "lg" : "default"}>
                      <AvatarFallback>{initials}</AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className={cn("min-w-64", isLargeText && "min-w-72 p-1.5")}
                >
                  <DropdownMenuLabel className={cn("flex items-center gap-2", isLargeText && "py-2")}>
                    <Avatar size={isLargeText ? "default" : "sm"}>
                      <AvatarFallback>{initials}</AvatarFallback>
                    </Avatar>
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className={cn("truncate font-medium", isLargeText && "text-base")}>{displayName}</span>
                      <span className={cn("truncate text-xs text-muted-foreground", isLargeText && "text-sm")}>
                        {userEmail}
                      </span>
                    </div>
                  </DropdownMenuLabel>
                  <div className="my-1 border-t" />
                  <DropdownMenuItem asChild className={avatarMenuItemClass}>
                    <Link href={salesModeHref}>
                      <ShoppingCart aria-hidden="true" />
                      Sales Mode
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild className={avatarMenuItemClass}>
                    <Link href={manageModeHref}>
                      <Settings2 aria-hidden="true" />
                      Manage Mode
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild className={avatarMenuItemClass}>
                    <Link href={toggleLargeTextHref}>
                      <Type aria-hidden="true" />
                      Large Text {isLargeText ? "Off" : "On"}
                    </Link>
                  </DropdownMenuItem>
                  <div className="my-1 border-t" />
                  <DropdownMenuItem disabled className={avatarMenuItemClass}>
                    <UserRound aria-hidden="true" />
                    Sales Profile
                  </DropdownMenuItem>
                  <div className="my-1 border-t" />
                  <LogoutMenuItem logoutFormId="sales-logout-form" className={avatarMenuItemClass} />
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        }
      >
        {children}
      </ContentShell>
    </div>
  );
}
