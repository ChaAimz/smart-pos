"use client";

import { useEffect } from "react";
import { toast } from "sonner";

type FlashToastProps = {
  id?: string;
  message?: string;
  variant?: "error" | "info" | "success";
};

export function FlashToast({
  id,
  message,
  variant = "info",
}: FlashToastProps) {
  useEffect(() => {
    if (!message) {
      return;
    }

    const toastId = id ?? `${variant}:${message}`;

    if (variant === "success") {
      toast.success(message, { id: toastId });
      return;
    }

    if (variant === "error") {
      toast.error(message, { id: toastId });
      return;
    }

    toast(message, { id: toastId });
  }, [id, message, variant]);

  return null;
}
