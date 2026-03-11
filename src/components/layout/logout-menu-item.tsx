"use client";

import { LogOut } from "lucide-react";

import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

type LogoutMenuItemProps = {
  logoutFormId: string;
  className?: string;
};

export function LogoutMenuItem({ logoutFormId, className }: LogoutMenuItemProps) {
  return (
    <DropdownMenuItem
      variant="destructive"
      className={className}
      onSelect={(event) => {
        event.preventDefault();

        const form = document.getElementById(logoutFormId);
        if (!(form instanceof HTMLFormElement)) {
          return;
        }

        form.requestSubmit();
      }}
    >
      <LogOut aria-hidden="true" />
      Logout
    </DropdownMenuItem>
  );
}
