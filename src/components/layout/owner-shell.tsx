"use client";

import {
  Activity,
  BarChart3,
  LayoutDashboard,
  Package,
  Settings,
  UserRound,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useSyncExternalStore } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { ContentShell } from "@/components/layout/content-shell";
import { AppBrand } from "@/components/layout/app-brand";
import { LogoutMenuItem } from "@/components/layout/logout-menu-item";

type OwnerShellProps = {
  activeNav: "overview" | "products" | "reports" | "activity" | "staff" | "settings";
  children: React.ReactNode;
  mainClassName?: string;
  pageTitle: string;
  userEmail: string;
};

const OWNER_SIDEBAR_COLLAPSED_KEY = "owner-sidebar-collapsed";
const OWNER_SIDEBAR_COLLAPSED_EVENT = "owner-sidebar-collapsed-change";

function isIpadDevice() {
  if (typeof navigator === "undefined") {
    return false;
  }

  const userAgent = navigator.userAgent;
  const isLegacyIpad = /\biPad\b/i.test(userAgent);
  const isModernIpad =
    navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;

  return isLegacyIpad || isModernIpad;
}

function SidebarMenuItem({
  active = false,
  collapsed = false,
  href,
  icon: Icon,
  label,
  soon = false,
}: {
  active?: boolean;
  collapsed?: boolean;
  href?: string;
  icon: React.ComponentType<React.ComponentProps<"svg">>;
  label: string;
  soon?: boolean;
}) {
  if (!href) {
    return (
      <Button
        type="button"
        variant="ghost"
        disabled
        title={collapsed ? label : undefined}
        className={cn(
          "h-9 w-full text-muted-foreground disabled:opacity-100",
          collapsed ? "justify-center px-0" : "justify-start",
        )}
      >
        <Icon aria-hidden="true" />
        <span className={collapsed ? "sr-only" : undefined}>{label}</span>
        {soon && !collapsed ? <Badge variant="outline" className="ml-auto">Soon</Badge> : null}
      </Button>
    );
  }

  return (
    <Button
      asChild
      type="button"
      variant={active ? "secondary" : "ghost"}
      title={collapsed ? label : undefined}
      className={cn("h-9 w-full", collapsed ? "justify-center px-0" : "justify-start")}
    >
      <Link href={href}>
        <Icon aria-hidden="true" />
        <span className={collapsed ? "sr-only" : undefined}>{label}</span>
      </Link>
    </Button>
  );
}

export function OwnerShell({
  activeNav,
  children,
  mainClassName,
  pageTitle,
  userEmail,
}: OwnerShellProps) {
  const displayName = userEmail.split("@")[0] || "Owner";
  const initials = displayName.slice(0, 2).toUpperCase();
  const avatarMenuItemClass = "gap-2 py-2";
  const isIpadAutoCollapse = useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === "undefined") {
        return () => undefined;
      }

      window.addEventListener("resize", onStoreChange);
      window.addEventListener("orientationchange", onStoreChange);
      return () => {
        window.removeEventListener("resize", onStoreChange);
        window.removeEventListener("orientationchange", onStoreChange);
      };
    },
    () => isIpadDevice(),
    () => false
  );
  const isCollapsed = useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === "undefined") {
        return () => undefined;
      }

      const handleChange = () => {
        onStoreChange();
      };

      window.addEventListener("storage", handleChange);
      window.addEventListener(OWNER_SIDEBAR_COLLAPSED_EVENT, handleChange);

      return () => {
        window.removeEventListener("storage", handleChange);
        window.removeEventListener(OWNER_SIDEBAR_COLLAPSED_EVENT, handleChange);
      };
    },
    () => {
      if (typeof window === "undefined") {
        return false;
      }

      return window.localStorage.getItem(OWNER_SIDEBAR_COLLAPSED_KEY) === "true";
    },
    () => false
  );
  const sidebarCollapsed = isIpadAutoCollapse || isCollapsed;

  const toggleSidebar = () => {
    if (isIpadAutoCollapse) {
      return;
    }

    const next = !isCollapsed;
    window.localStorage.setItem(OWNER_SIDEBAR_COLLAPSED_KEY, String(next));
    window.dispatchEvent(new Event(OWNER_SIDEBAR_COLLAPSED_EVENT));
  };

  return (
    <div className="min-h-screen bg-muted/40">
      <form id="owner-logout-form" action="/api/auth/logout" method="post" className="hidden" />
      <div
        className={cn(
          "grid min-h-screen transition-[grid-template-columns] duration-200",
          sidebarCollapsed ? "md:grid-cols-[72px_1fr]" : "md:grid-cols-[240px_1fr]",
        )}
      >
        <aside className="hidden border-r bg-background md:sticky md:top-0 md:flex md:h-screen md:flex-col">
          <div
            className={cn(
              "flex h-14 shrink-0 items-center border-b",
              sidebarCollapsed ? "justify-center px-2" : "px-4",
            )}
          >
            <button
              type="button"
              onClick={toggleSidebar}
              disabled={isIpadAutoCollapse}
              className={cn(
                "inline-flex w-full rounded-md transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                "disabled:cursor-default disabled:hover:bg-transparent disabled:opacity-100",
                sidebarCollapsed ? "justify-center px-1 py-1" : "justify-start px-2 py-1"
              )}
              aria-label={
                isIpadAutoCollapse
                  ? "Sidebar auto-collapsed on iPad"
                  : sidebarCollapsed
                    ? "Expand sidebar"
                    : "Collapse sidebar"
              }
              title={
                isIpadAutoCollapse
                  ? "Sidebar auto-collapsed on iPad"
                  : sidebarCollapsed
                    ? "Expand sidebar"
                    : "Collapse sidebar"
              }
            >
              <AppBrand hideLabel={sidebarCollapsed} />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <nav className="flex flex-col gap-1">
              <SidebarMenuItem
                active={activeNav === "overview"}
                collapsed={sidebarCollapsed}
                href="/owner"
                icon={LayoutDashboard}
                label="Overview"
              />
              <SidebarMenuItem
                active={activeNav === "products"}
                collapsed={sidebarCollapsed}
                href="/owner/products"
                icon={Package}
                label="Products"
              />
              <SidebarMenuItem
                active={activeNav === "reports"}
                collapsed={sidebarCollapsed}
                href="/owner/reports"
                icon={BarChart3}
                label="Reports"
              />
              <SidebarMenuItem
                active={activeNav === "activity"}
                collapsed={sidebarCollapsed}
                href="/owner/activity"
                icon={Activity}
                label="Activity Log"
              />
              <SidebarMenuItem
                active={activeNav === "staff"}
                collapsed={sidebarCollapsed}
                href="/owner/staff"
                icon={Users}
                label="Staff"
              />
              <SidebarMenuItem
                active={activeNav === "settings"}
                collapsed={sidebarCollapsed}
                href="/owner/settings"
                icon={Settings}
                label="Settings"
              />
            </nav>
          </div>

        </aside>

        <ContentShell
          rootClassName="h-screen min-h-0 overflow-hidden"
          headerClassName="sticky top-0 z-10 flex h-14 items-center border-b bg-background px-4 md:px-6"
          mainClassName={cn(
            "flex min-h-0 flex-1 flex-col p-4",
            mainClassName
          )}
          header={
            <>
              <div className="min-w-0 flex-1">
                <Breadcrumb>
                  <BreadcrumbList>
                    <BreadcrumbItem>
                      <BreadcrumbLink asChild>
                        <Link href="/owner">Owner</Link>
                      </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <BreadcrumbPage className="truncate">{pageTitle}</BreadcrumbPage>
                    </BreadcrumbItem>
                  </BreadcrumbList>
                </Breadcrumb>
              </div>
              <div className="ml-4 flex items-center">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      className="size-10 rounded-full border-border/70 p-0"
                      aria-label="Open owner profile menu"
                    >
                      <Avatar>
                        <AvatarFallback>{initials}</AvatarFallback>
                      </Avatar>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-64">
                    <DropdownMenuLabel className="flex items-center gap-2">
                      <Avatar size="sm">
                        <AvatarFallback>{initials}</AvatarFallback>
                      </Avatar>
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="truncate font-medium">{displayName}</span>
                        <span className="truncate text-xs text-muted-foreground">{userEmail}</span>
                      </div>
                    </DropdownMenuLabel>
                    <div className="my-1 border-t" />
                    <DropdownMenuItem disabled className={avatarMenuItemClass}>
                      <UserRound aria-hidden="true" />
                      Owner account
                    </DropdownMenuItem>
                    <div className="my-1 border-t" />
                    <DropdownMenuItem asChild className={avatarMenuItemClass}>
                      <Link href="/owner">
                        <LayoutDashboard aria-hidden="true" />
                        Overview
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild className={avatarMenuItemClass}>
                      <Link href="/owner/products">
                        <Package aria-hidden="true" />
                        Products
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild className={avatarMenuItemClass}>
                      <Link href="/owner/reports">
                        <BarChart3 aria-hidden="true" />
                        Reports
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild className={avatarMenuItemClass}>
                      <Link href="/owner/activity">
                        <Activity aria-hidden="true" />
                        Activity Log
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild className={avatarMenuItemClass}>
                      <Link href="/owner/staff">
                        <Users aria-hidden="true" />
                        Staff
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild className={avatarMenuItemClass}>
                      <Link href="/owner/settings">
                        <Settings aria-hidden="true" />
                        Settings
                      </Link>
                    </DropdownMenuItem>
                    <div className="my-1 border-t" />
                    <LogoutMenuItem logoutFormId="owner-logout-form" className={avatarMenuItemClass} />
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </>
          }
        >
          <div className="flex min-h-0 flex-1 flex-col">
            {children}
          </div>
        </ContentShell>
      </div>
    </div>
  );
}
