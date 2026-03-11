"use client";

import {
  Activity,
  BarChart3,
  LayoutDashboard,
  Package,
  Settings,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useSyncExternalStore } from "react";

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
import { cn } from "@/lib/utils";
import { ContentShell } from "@/components/layout/content-shell";
import { AppBrand } from "@/components/layout/app-brand";

type OwnerShellProps = {
  activeNav: "overview" | "products" | "reports" | "activity" | "staff" | "settings";
  children: React.ReactNode;
  dbStatus: "up" | "down";
  mainClassName?: string;
  pageTitle: string;
  userEmail: string;
};

const OWNER_SIDEBAR_COLLAPSED_KEY = "owner-sidebar-collapsed";
const OWNER_SIDEBAR_COLLAPSED_EVENT = "owner-sidebar-collapsed-change";

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
  dbStatus,
  mainClassName,
  pageTitle,
  userEmail,
}: OwnerShellProps) {
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

  const toggleSidebar = () => {
    const next = !isCollapsed;
    window.localStorage.setItem(OWNER_SIDEBAR_COLLAPSED_KEY, String(next));
    window.dispatchEvent(new Event(OWNER_SIDEBAR_COLLAPSED_EVENT));
  };

  return (
    <div className="min-h-screen bg-muted/40">
      <div
        className={cn(
          "grid min-h-screen transition-[grid-template-columns] duration-200",
          isCollapsed ? "md:grid-cols-[72px_1fr]" : "md:grid-cols-[240px_1fr]",
        )}
      >
        <aside className="hidden border-r bg-background md:flex md:flex-col">
          <div
            className={cn(
              "flex h-14 items-center border-b",
              isCollapsed ? "justify-center px-2" : "px-4",
            )}
          >
            <button
              type="button"
              onClick={toggleSidebar}
              className={cn(
                "inline-flex w-full rounded-md transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isCollapsed ? "justify-center px-1 py-1" : "justify-start px-2 py-1"
              )}
              aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <AppBrand hideLabel={isCollapsed} />
            </button>
          </div>

          <div className="flex-1 p-3">
            <nav className="flex flex-col gap-1">
              <SidebarMenuItem
                active={activeNav === "overview"}
                collapsed={isCollapsed}
                href="/owner"
                icon={LayoutDashboard}
                label="Overview"
              />
              <SidebarMenuItem
                active={activeNav === "products"}
                collapsed={isCollapsed}
                href="/owner/products"
                icon={Package}
                label="Products"
              />
              <SidebarMenuItem
                active={activeNav === "reports"}
                collapsed={isCollapsed}
                href="/owner/reports"
                icon={BarChart3}
                label="Reports"
              />
              <SidebarMenuItem
                active={activeNav === "activity"}
                collapsed={isCollapsed}
                href="/owner/activity"
                icon={Activity}
                label="Activity Log"
              />
              <SidebarMenuItem
                active={activeNav === "staff"}
                collapsed={isCollapsed}
                href="/owner/staff"
                icon={Users}
                label="Staff"
              />
              <SidebarMenuItem
                active={activeNav === "settings"}
                collapsed={isCollapsed}
                href="/owner/settings"
                icon={Settings}
                label="Settings"
              />
            </nav>
          </div>

          <div className={cn("border-t py-3", isCollapsed ? "px-2" : "px-4")}>
            {isCollapsed ? (
              <p className="text-center text-xs text-muted-foreground">Owner</p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">Owner account</p>
                <p className="truncate text-sm font-medium">{userEmail}</p>
              </>
            )}
          </div>
        </aside>

        <ContentShell
          headerClassName="sticky top-0 z-10 flex h-14 items-center border-b bg-background px-4 md:px-6"
          mainClassName={cn(
            "flex min-h-0 flex-1 flex-col px-4 pt-4 pb-3 md:px-6 md:pt-6 md:pb-4",
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
              <div className="ml-4 flex items-center gap-2">
                <Badge variant="outline">OWNER</Badge>
                <Badge variant={dbStatus === "up" ? "default" : "secondary"}>
                  DB {dbStatus.toUpperCase()}
                </Badge>
                <form action="/api/auth/logout" method="post">
                  <Button variant="outline" size="sm" type="submit">
                    Logout
                  </Button>
                </form>
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
