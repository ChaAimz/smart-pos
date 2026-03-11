"use client"

import { useSyncExternalStore } from "react"
import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

function readSalesTextMode() {
  return document.documentElement.getAttribute("data-sales-text-mode") === "large"
}

function subscribeSalesTextModeStore(onStoreChange: () => void) {
  if (typeof document === "undefined") {
    return () => {};
  }

  const observer = new MutationObserver(() => {
    onStoreChange();
  });

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-sales-text-mode"],
  });

  return () => observer.disconnect();
}

function getSalesTextModeSnapshot() {
  if (typeof document === "undefined") {
    return false;
  }

  return readSalesTextMode();
}

const Toaster = ({ ...props }: ToasterProps) => {
  const isLargeTextMode = useSyncExternalStore(
    subscribeSalesTextModeStore,
    getSalesTextModeSnapshot,
    () => false
  );

  return (
    <Sonner
      theme="system"
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: isLargeTextMode ? "px-4 py-3 text-base" : "px-4 py-2.5 text-sm",
          title: isLargeTextMode ? "text-base font-semibold" : "text-sm font-semibold",
          description: isLargeTextMode ? "text-sm leading-6" : "text-xs leading-5",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
