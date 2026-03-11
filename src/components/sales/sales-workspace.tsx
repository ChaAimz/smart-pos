"use client";

import {
  ArrowLeftRight,
  Banknote,
  Clock3,
  CreditCard,
  Minus,
  PackageMinus,
  PackagePlus,
  Plus,
  QrCode,
  ScanLine,
  Search,
  ShoppingCart,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { type AppUserRole } from "@/lib/auth";
import { formatCurrencyFromCents, type StoreCurrencyCode } from "@/lib/currency";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  TypographyMuted,
  TypographyP,
  TypographySmall,
} from "@/components/ui/typography";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type PaymentMethod = "cash" | "qr_code" | "credit_card";
type WorkspaceMode = "sales" | "manage";
type AdjustmentDirection = "increase" | "decrease";

type ProductSummary = {
  id: string;
  name: string;
  sku: string;
  priceCents: number;
  stockQty: number;
  isSellable: boolean;
  barcodes: Array<{
    code: string;
  }>;
};

type SalesWorkspaceProps = {
  currencyCode: StoreCurrencyCode;
  workspaceMode: WorkspaceMode;
  isLargeText: boolean;
  userRole: AppUserRole;
  shiftEnabled: boolean;
  approvalEnabled: boolean;
  initialShiftOpen: boolean;
  pendingAdjustments: Array<{
    id: string;
    quantityDelta: number;
    reason: string;
    product: {
      name: string;
      sku: string;
    };
    createdByUser: {
      email: string;
      role: AppUserRole;
    };
  }>;
  products: ProductSummary[];
};

type TicketItem = {
  productId: string;
  name: string;
  sku: string;
  quantity: number;
  unitPriceCents: number;
};

function formatPrice(cents: number, currencyCode: StoreCurrencyCode) {
  return formatCurrencyFromCents(cents, currencyCode);
}

function createIdempotencyKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `sale_${crypto.randomUUID()}`;
  }

  return `sale_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function formatSaleReference(saleId?: string) {
  if (!saleId) {
    return null;
  }

  return saleId.slice(-6).toUpperCase();
}

export function SalesWorkspace({
  currencyCode,
  workspaceMode,
  isLargeText,
  userRole,
  shiftEnabled,
  approvalEnabled,
  initialShiftOpen,
  pendingAdjustments,
  products,
}: SalesWorkspaceProps) {
  const router = useRouter();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [ticketItems, setTicketItems] = useState<TicketItem[]>([]);
  const [checkoutAttemptKey, setCheckoutAttemptKey] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isPayDialogOpen, setIsPayDialogOpen] = useState(false);
  const [confirmPaymentMethod, setConfirmPaymentMethod] = useState<PaymentMethod | null>(null);
  const [pendingDeleteItem, setPendingDeleteItem] = useState<TicketItem | null>(null);
  const [isSubmittingSale, setIsSubmittingSale] = useState(false);
  const [isShiftOpen, setIsShiftOpen] = useState(shiftEnabled ? initialShiftOpen : true);
  const [isUpdatingShift, setIsUpdatingShift] = useState(false);
  const [inventoryCode, setInventoryCode] = useState("");
  const [inventoryQty, setInventoryQty] = useState("1");
  const [inventoryReason, setInventoryReason] = useState("");
  const [relatedStockQuery, setRelatedStockQuery] = useState("");
  const [adjustmentDirection, setAdjustmentDirection] = useState<AdjustmentDirection>(
    "increase"
  );
  const [isSubmittingInventory, setIsSubmittingInventory] = useState(false);
  const [processingApprovalId, setProcessingApprovalId] = useState<string | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-sales-text-mode", isLargeText ? "large" : "normal");

    return () => {
      root.removeAttribute("data-sales-text-mode");
    };
  }, [isLargeText]);

  const productById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products]
  );

  const itemCount = useMemo(
    () => ticketItems.reduce((sum, item) => sum + item.quantity, 0),
    [ticketItems]
  );
  const subtotalCents = useMemo(
    () =>
      ticketItems.reduce(
        (sum, item) => sum + item.quantity * item.unitPriceCents,
        0
      ),
    [ticketItems]
  );
  const searchMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      return [];
    }

    return products
      .filter((product) => {
        if (product.name.toLowerCase().includes(q)) {
          return true;
        }
        if (product.sku.toLowerCase().includes(q)) {
          return true;
        }

        return product.barcodes.some((barcode) => barcode.code.toLowerCase().includes(q));
      })
      .slice(0, 8);
  }, [products, searchQuery]);
  const relatedStockMatches = useMemo(() => {
    const q = relatedStockQuery.trim().toLowerCase();
    if (!q) {
      return products;
    }

    return products.filter((product) => {
      if (product.name.toLowerCase().includes(q)) {
        return true;
      }

      if (product.sku.toLowerCase().includes(q)) {
        return true;
      }

      if (product.barcodes.some((barcode) => barcode.code.toLowerCase().includes(q))) {
        return true;
      }

      if (q === "sellable" || q === "active") {
        return product.isSellable && product.stockQty > 0;
      }

      if (q === "out" || q === "oos") {
        return product.isSellable && product.stockQty <= 0;
      }

      if (q === "blocked") {
        return !product.isSellable;
      }

      return false;
    });
  }, [products, relatedStockQuery]);

  function getTicketQuantity(productId: string) {
    return ticketItems.find((item) => item.productId === productId)?.quantity ?? 0;
  }

  function addProduct(product: ProductSummary) {
    setCheckoutAttemptKey(null);
    if (!product.isSellable) {
      toast.error("Product unavailable", {
        description: `${product.name} cannot be sold right now.`,
      });
      return;
    }

    const currentQty = getTicketQuantity(product.id);
    if (currentQty >= product.stockQty) {
      toast.error("Stock limit reached", {
        description:
          product.stockQty <= 0
            ? `${product.name} is out of stock.`
            : `${product.name} has only ${product.stockQty} left in stock.`,
      });
      return;
    }

    setTicketItems((prev) => {
      const existing = prev.find((item) => item.productId === product.id);
      if (existing) {
        return prev.map((item) =>
          item.productId === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }

      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          sku: product.sku,
          quantity: 1,
          unitPriceCents: product.priceCents,
        },
      ];
    });
  }

  function changeQuantity(productId: string, delta: number) {
    setCheckoutAttemptKey(null);

    if (delta > 0) {
      const product = productById.get(productId);
      const currentQty = getTicketQuantity(productId);

      if (!product) {
        toast.error("Product unavailable", {
          description: "This product is no longer available.",
        });
        return;
      }

      if (!product.isSellable) {
        toast.error("Product unavailable", {
          description: `${product.name} cannot be sold right now.`,
        });
        return;
      }

      if (currentQty >= product.stockQty) {
        toast.error("Stock limit reached", {
          description:
            product.stockQty <= 0
              ? `${product.name} is out of stock.`
              : `${product.name} has only ${product.stockQty} left in stock.`,
        });
        return;
      }
    }

    setTicketItems((prev) =>
      prev
        .map((item) =>
          item.productId === productId
            ? { ...item, quantity: item.quantity + delta }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  }

  function removeItem(productId: string) {
    setCheckoutAttemptKey(null);
    setTicketItems((prev) => prev.filter((item) => item.productId !== productId));
  }

  function findProductFromSearch(rawQuery: string) {
    const q = rawQuery.trim().toLowerCase();
    if (!q) {
      return null;
    }

    const exactMatch = products.find((product) => {
      if (product.sku.toLowerCase() === q) {
        return true;
      }
      if (product.name.toLowerCase() === q) {
        return true;
      }

      return product.barcodes.some((barcode) => barcode.code.toLowerCase() === q);
    });
    if (exactMatch) {
      return exactMatch;
    }

    const partialMatches = products.filter((product) => {
      if (product.name.toLowerCase().includes(q)) {
        return true;
      }
      if (product.sku.toLowerCase().includes(q)) {
        return true;
      }

      return product.barcodes.some((barcode) => barcode.code.toLowerCase().includes(q));
    });

    return partialMatches.length === 1 ? partialMatches[0] : null;
  }

  function submitSearchQuery() {
    const q = searchQuery.trim();
    if (!q) {
      return;
    }

    const foundProduct = findProductFromSearch(q);
    if (!foundProduct) {
      toast.error("No matching product", {
        description: "Scan full QR/barcode or enter an exact SKU.",
      });
      return;
    }

    addProduct(foundProduct);
    setSearchQuery("");
    setIsSearchOpen(false);
    searchInputRef.current?.focus();
  }

  function addProductFromCombobox(productId: string) {
    const selectedProduct = productById.get(productId);
    if (!selectedProduct) {
      toast.error("Product unavailable", {
        description: "This product is no longer available.",
      });
      return;
    }

    addProduct(selectedProduct);
    setSearchQuery("");
    setIsSearchOpen(false);
    searchInputRef.current?.focus();
  }

  async function submitSale(paymentMethod: PaymentMethod) {
    if (shiftEnabled && !isShiftOpen) {
      toast.error("Checkout blocked", {
        description: "Open shift before accepting payment.",
      });
      return;
    }

    if (ticketItems.length === 0) {
      toast.error("No items in ticket", {
        description: "Add at least one item before checkout.",
      });
      return;
    }

    setIsSubmittingSale(true);
    const idempotencyKey = checkoutAttemptKey ?? createIdempotencyKey();
    if (!checkoutAttemptKey) {
      setCheckoutAttemptKey(idempotencyKey);
    }

    try {
      const response = await fetch("/api/sales", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify({
          paymentMethod,
          items: ticketItems.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
          })),
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            error?: string;
            sale?: {
              id: string;
              totalCents: number;
            };
          }
        | null;

      if (!response.ok) {
        toast.error("Checkout failed", {
          description: payload?.error ?? "Unable to save this sale. Please try again.",
        });
        return;
      }

      setTicketItems([]);
      setCheckoutAttemptKey(null);
      const saleTotal = payload?.sale?.totalCents ?? subtotalCents;
      const saleRef = formatSaleReference(payload?.sale?.id);
      toast.success("Payment completed", {
        description: saleRef
          ? `Receipt #${saleRef} created. Total ${formatPrice(saleTotal, currencyCode)}.`
          : `Receipt created. Total ${formatPrice(saleTotal, currencyCode)}.`,
      });
      router.refresh();
    } catch {
      toast.error("Network error", {
        description: "Connection issue while saving this sale.",
      });
    } finally {
      setIsSubmittingSale(false);
    }
  }

  async function handleShiftAction(action: "open" | "close") {
    setIsUpdatingShift(true);

    try {
      const response = await fetch(`/api/shift/${action}`, {
        method: "POST",
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string; message?: string }
        | null;

      if (!response.ok) {
        toast.error("Shift update failed", {
          description: payload?.error ?? `Unable to ${action} shift.`,
        });
        return;
      }

      setIsShiftOpen(action === "open");
      toast.success("Shift updated", {
        description: payload?.message ?? `Shift ${action}ed.`,
      });
      router.refresh();
    } catch {
      toast.error("Network error", {
        description: "Connection issue while changing shift status.",
      });
    } finally {
      setIsUpdatingShift(false);
    }
  }

  async function submitInventoryMovement(kind: "receive" | "adjust") {
    const code = inventoryCode.trim();
    const reason = inventoryReason.trim();
    const qty = Number(inventoryQty);

    if (!code) {
      toast.error("Missing product code", {
        description: "Enter SKU or barcode code.",
      });
      return;
    }
    if (!Number.isInteger(qty) || qty <= 0) {
      toast.error("Invalid quantity", {
        description: "Quantity must be a positive integer.",
      });
      return;
    }
    if (reason.length < 3) {
      toast.error("Invalid reason", {
        description: "Reason must be at least 3 characters.",
      });
      return;
    }

    setIsSubmittingInventory(true);

    try {
      const payload =
        kind === "receive"
          ? {
              kind,
              code,
              quantity: qty,
              reason,
            }
          : {
              kind,
              code,
              quantityDelta: adjustmentDirection === "increase" ? qty : -qty,
              reason,
            };

      const response = await fetch("/api/inventory/movements", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const body = (await response.json().catch(() => null)) as
        | {
            error?: string;
            message?: string;
          }
        | null;

      if (!response.ok) {
        toast.error("Inventory update failed", {
          description: body?.error ?? "Unable to apply inventory movement.",
        });
        return;
      }

      toast.success("Inventory updated", {
        description: body?.message ?? "Inventory movement has been recorded.",
      });
      setInventoryCode("");
      setInventoryReason("");
      setInventoryQty("1");
      router.refresh();
    } catch {
      toast.error("Network error", {
        description: "Connection issue while updating inventory.",
      });
    } finally {
      setIsSubmittingInventory(false);
    }
  }

  async function submitAdjustmentApproval(
    movementId: string,
    action: "approve" | "reject"
  ) {
    setProcessingApprovalId(movementId);

    try {
      const response = await fetch(`/api/inventory/approvals/${movementId}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ action }),
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: string; message?: string }
        | null;

      if (!response.ok) {
        toast.error("Approval failed", {
          description: body?.error ?? "Unable to process adjustment.",
        });
        return;
      }

      toast.success("Adjustment updated", {
        description: body?.message ?? "Stock adjustment status was updated.",
      });
      router.refresh();
    } catch {
      toast.error("Network error", {
        description: "Connection issue while processing approval.",
      });
    } finally {
      setProcessingApprovalId(null);
    }
  }

  const checkoutDisabled =
    isSubmittingSale || ticketItems.length === 0 || (shiftEnabled && !isShiftOpen);

  function openPayDialog() {
    if (checkoutDisabled) {
      return;
    }

    setIsPayDialogOpen(true);
  }

  function paymentMethodLabel(method: PaymentMethod) {
    if (method === "cash") {
      return "Cash";
    }

    if (method === "qr_code") {
      return "QR Code";
    }

    return "Credit Card";
  }

  function selectPaymentMethod(method: PaymentMethod) {
    setIsPayDialogOpen(false);
    setConfirmPaymentMethod(method);
  }

  function confirmPayment() {
    if (!confirmPaymentMethod) {
      return;
    }

    const method = confirmPaymentMethod;
    setConfirmPaymentMethod(null);
    void submitSale(method);
  }

  return (
    <>
      <Dialog open={isPayDialogOpen} onOpenChange={setIsPayDialogOpen}>
        <DialogContent className={cn("sm:max-w-md", isLargeText && "sm:max-w-lg")}>
          <DialogHeader>
            <DialogTitle className={cn("text-xl", isLargeText && "text-2xl")}>
              Select Payment Method
            </DialogTitle>
            <DialogDescription className={cn("text-sm", isLargeText && "text-base")}>
              Choose how the customer will pay.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-border bg-muted/40 px-4 py-3">
            <p className={cn("text-sm text-muted-foreground", isLargeText && "text-base")}>
              Subtotal
            </p>
            <div className="mt-1 flex items-end justify-between gap-3">
              <p
                className={cn(
                  "text-3xl font-semibold tracking-tight tabular-nums",
                  isLargeText && "text-4xl"
                )}
              >
                {formatPrice(subtotalCents, currencyCode)}
              </p>
              <p
                className={cn(
                  "self-end text-lg leading-none font-semibold tabular-nums",
                  isLargeText && "text-xl"
                )}
              >
                {itemCount} {itemCount === 1 ? "item" : "items"}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-5">
            <Button
              type="button"
              size="lg"
              className={cn(
                "aspect-square h-auto flex-col justify-center rounded-xl text-center text-sm",
                isLargeText && "text-base"
              )}
              disabled={isSubmittingSale}
              onClick={() => {
                selectPaymentMethod("cash");
              }}
            >
              <Banknote aria-hidden="true" />
              Cash
            </Button>
            <Button
              type="button"
              size="lg"
              variant="secondary"
              className={cn(
                "aspect-square h-auto flex-col justify-center rounded-xl text-center text-sm",
                isLargeText && "text-base"
              )}
              disabled={isSubmittingSale}
              onClick={() => {
                selectPaymentMethod("qr_code");
              }}
            >
              <QrCode aria-hidden="true" />
              QR Code
            </Button>
            <Button
              type="button"
              size="lg"
              variant="outline"
              className={cn(
                "aspect-square h-auto flex-col justify-center rounded-xl text-center text-sm",
                isLargeText && "text-base"
              )}
              disabled={isSubmittingSale}
              onClick={() => {
                selectPaymentMethod("credit_card");
              }}
            >
              <CreditCard aria-hidden="true" />
              Credit Card
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmPaymentMethod !== null}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmPaymentMethod(null);
          }
        }}
      >
        <DialogContent className={cn("sm:max-w-sm", isLargeText && "sm:max-w-md")}>
          <DialogHeader>
            <DialogTitle className={cn("text-xl", isLargeText && "text-2xl")}>
              Confirm Payment
            </DialogTitle>
            <DialogDescription className={cn("text-sm", isLargeText && "text-base")}>
              Please confirm before completing this transaction.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-border bg-muted/40 px-4 py-3">
            <p className={cn("text-sm text-muted-foreground", isLargeText && "text-base")}>
              Method
            </p>
            <p className={cn("text-lg font-semibold", isLargeText && "text-xl")}>
              {confirmPaymentMethod ? paymentMethodLabel(confirmPaymentMethod) : "-"}
            </p>
            <p className={cn("mt-2 text-sm text-muted-foreground", isLargeText && "text-base")}>
              Subtotal
            </p>
            <p
              className={cn(
                "text-3xl font-semibold tracking-tight tabular-nums",
                isLargeText && "text-4xl"
              )}
            >
              {formatPrice(subtotalCents, currencyCode)}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Button
              type="button"
              variant="outline"
              size="lg"
              className={cn("text-base", isLargeText && "text-lg")}
              disabled={isSubmittingSale}
              onClick={() => {
                setConfirmPaymentMethod(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="lg"
              className={cn("text-base", isLargeText && "text-lg")}
              disabled={isSubmittingSale}
              onClick={confirmPayment}
            >
              Confirm
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={pendingDeleteItem !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDeleteItem(null);
          }
        }}
      >
        <DialogContent className={cn("sm:max-w-sm", isLargeText && "sm:max-w-md")}>
          <DialogHeader>
            <DialogTitle className={cn("text-xl", isLargeText && "text-2xl")}>
              Confirm Delete
            </DialogTitle>
            <DialogDescription className={cn("text-sm", isLargeText && "text-base")}>
              Remove this item from the current ticket?
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-border bg-muted/40 px-4 py-3">
            <p
              className={cn(
                "truncate text-base font-semibold",
                isLargeText && "text-lg"
              )}
            >
              {pendingDeleteItem?.name ?? "-"}
            </p>
            <p className={cn("text-sm text-muted-foreground", isLargeText && "text-base")}>
              {pendingDeleteItem?.sku ?? "-"}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Button
              type="button"
              variant="outline"
              size="lg"
              className={cn("text-base", isLargeText && "text-lg")}
              onClick={() => {
                setPendingDeleteItem(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="lg"
              variant="destructive"
              className={cn("text-base", isLargeText && "text-lg")}
              onClick={() => {
                if (pendingDeleteItem) {
                  removeItem(pendingDeleteItem.productId);
                }
                setPendingDeleteItem(null);
              }}
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {workspaceMode === "sales" ? (
        <div className="flex min-h-[calc(100dvh-4rem-2rem)] flex-col pb-0 md:min-h-[calc(100dvh-4rem-3rem)] md:pb-40 lg:pb-0">
          <section className="grid min-h-0 flex-1 grid-cols-1 gap-4">
            <Card className="min-w-0 min-h-0 flex-1">
              <CardContent className="flex h-full min-h-0 flex-col pt-3">
                <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
                  <Popover
                    open={isSearchOpen && searchQuery.trim().length > 0}
                    onOpenChange={setIsSearchOpen}
                  >
                    <PopoverTrigger asChild>
                      <div className="relative w-full">
                        <ScanLine
                          className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <Input
                          ref={searchInputRef}
                          role="combobox"
                          aria-expanded={isSearchOpen}
                          aria-controls="sales-search-combobox"
                          placeholder="Scan QR/barcode, enter SKU, or search name"
                          className={cn(
                            "h-12 pl-11 text-base font-medium tracking-tight placeholder:text-sm sm:text-lg sm:placeholder:text-base md:text-lg md:placeholder:text-base",
                            isLargeText &&
                              "h-14 text-lg sm:text-xl sm:placeholder:text-lg md:text-xl md:placeholder:text-lg"
                          )}
                          value={searchQuery}
                          onFocus={() => {
                            setIsSearchOpen(searchQuery.trim().length > 0);
                          }}
                          onChange={(event) => {
                            const nextValue = event.target.value;
                            setSearchQuery(nextValue);
                            setIsSearchOpen(nextValue.trim().length > 0);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Escape") {
                              setIsSearchOpen(false);
                              return;
                            }

                            if (event.key !== "Enter") {
                              return;
                            }

                            event.preventDefault();
                            submitSearchQuery();
                          }}
                        />
                      </div>
                    </PopoverTrigger>
                    <PopoverContent
                      align="start"
                      sideOffset={6}
                      className="w-(--radix-popover-trigger-width) p-0"
                      onOpenAutoFocus={(event) => {
                        event.preventDefault();
                      }}
                      onCloseAutoFocus={(event) => {
                        event.preventDefault();
                      }}
                    >
                      <Command
                        shouldFilter={false}
                        className={cn(
                          "[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-sm [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:tracking-wide",
                          isLargeText &&
                            "[&_[cmdk-group-heading]]:text-base [&_[cmdk-group-heading]]:py-2.5"
                        )}
                      >
                        <CommandList id="sales-search-combobox" className="max-h-[360px] scroll-py-2">
                          <CommandEmpty className={cn("py-8 text-base", isLargeText && "py-10 text-lg")}>
                            {searchQuery.trim()
                              ? "No matching product."
                              : "Type SKU, barcode, or product name."}
                          </CommandEmpty>
                          <CommandGroup heading="Matching products">
                            {searchMatches.map((product) => (
                              <CommandItem
                                key={product.id}
                                value={product.id}
                                onSelect={(selectedProductId) => {
                                  addProductFromCombobox(selectedProductId);
                                }}
                                className={cn(
                                  "grid min-h-16 grid-cols-[minmax(0,1fr)_96px] items-center gap-x-4 rounded-md px-3 py-2 data-[selected=true]:bg-primary/10 data-[selected=true]:text-foreground data-[selected=true]:ring-1 data-[selected=true]:ring-primary/30",
                                  isLargeText &&
                                    "min-h-20 grid-cols-[minmax(0,1fr)_112px] gap-x-5 px-4 py-3"
                                )}
                              >
                                <div className="min-w-0">
                                  <TypographyP
                                    className={cn(
                                      "truncate text-base leading-6 font-semibold",
                                      isLargeText && "text-lg leading-7"
                                    )}
                                  >
                                    {product.name}
                                  </TypographyP>
                                  <TypographyMuted
                                    className={cn(
                                      "truncate text-sm leading-5",
                                      isLargeText && "text-base leading-6"
                                    )}
                                  >
                                    {product.sku} • {product.stockQty} left
                                  </TypographyMuted>
                                </div>
                                <TypographyP
                                  className={cn(
                                    "w-full text-right text-base font-semibold tabular-nums",
                                    isLargeText && "text-lg"
                                  )}
                                >
                                  {formatPrice(product.priceCents, currencyCode)}
                                </TypographyP>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <TooltipProvider delayDuration={120}>
                    <div className="ml-auto inline-flex shrink-0 items-center gap-2">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className={cn(
                              "size-12 rounded-2xl border border-primary/25 bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary [&_svg]:size-5",
                              isLargeText && "size-14 [&_svg]:size-6"
                            )}
                            aria-label="Add matched product"
                            onClick={() => {
                              submitSearchQuery();
                            }}
                          >
                            <Plus aria-hidden="true" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" sideOffset={8}>
                          Add item
                        </TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            disabled={itemCount === 0}
                            className={cn(
                              "size-12 rounded-2xl border border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/15 hover:text-destructive [&_svg]:size-5",
                              isLargeText && "size-14 [&_svg]:size-6",
                              itemCount === 0 &&
                                "border-border/70 bg-muted/50 text-muted-foreground hover:bg-muted/50 hover:text-muted-foreground"
                            )}
                            aria-label="Clear current ticket"
                            onClick={() => {
                              setTicketItems([]);
                            }}
                          >
                            <Trash2 aria-hidden="true" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" sideOffset={8}>
                          Clear ticket
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </TooltipProvider>
                </div>

                <div className="min-h-0 flex-1">
                  {ticketItems.length === 0 ? (
                    <div className="flex h-full min-h-56 flex-col items-center justify-center rounded-md border border-dashed border-border bg-muted/50 p-6 text-center md:min-h-72">
                      <ShoppingCart className="mb-3 size-6 text-muted-foreground" aria-hidden="true" />
                      <TypographyP
                        className={cn("text-base font-semibold sm:text-lg", isLargeText && "text-lg sm:text-xl")}
                      >
                        No items in this ticket
                      </TypographyP>
                      <TypographyMuted
                        className={cn(
                          "mt-2 text-sm leading-6 sm:text-base",
                          isLargeText && "text-base sm:text-lg"
                        )}
                      >
                        Scan QR/barcode or enter SKU to add products here.
                      </TypographyMuted>
                    </div>
                  ) : (
                    <div
                      className={cn(
                        "flex h-full min-h-0 flex-col gap-3 overflow-y-auto pr-1",
                        isLargeText && "gap-4"
                      )}
                    >
                      {ticketItems.map((item) => {
                        const product = productById.get(item.productId);
                        const maxReached = Boolean(product && item.quantity >= product.stockQty);
                        const lineTotalCents = item.quantity * item.unitPriceCents;

                        return (
                          <div
                            key={item.productId}
                            className={cn(
                              "grid grid-cols-[minmax(0,1fr)_96px_136px_104px_44px] items-center gap-x-4 rounded-md border border-border bg-background p-3.5",
                              isLargeText &&
                                "grid-cols-[minmax(0,1fr)_112px_156px_120px_48px] gap-x-5 p-4"
                            )}
                          >
                            <div className="min-w-0 flex-1">
                              <TypographyP
                                className={cn(
                                  "truncate text-base leading-6 font-semibold",
                                  isLargeText && "text-lg leading-7"
                                )}
                              >
                                {item.name}
                              </TypographyP>
                              <TypographyMuted
                                className={cn("text-sm leading-6", isLargeText && "text-base leading-7")}
                              >
                                {item.sku}
                                {product ? ` • ${Math.max(product.stockQty - item.quantity, 0)} left` : ""}
                              </TypographyMuted>
                            </div>
                            <TypographyP
                              className={cn(
                                "w-full text-right text-base font-semibold tabular-nums text-foreground/90",
                                isLargeText && "text-lg"
                              )}
                            >
                              {formatPrice(item.unitPriceCents, currencyCode)}
                            </TypographyP>
                            <div className="flex items-center justify-center gap-1.5">
                              <Button
                                variant="outline"
                                size="icon"
                                className={cn("size-9", isLargeText && "size-10")}
                                onClick={() => {
                                  changeQuantity(item.productId, -1);
                                }}
                              >
                                <Minus className="size-4" aria-hidden="true" />
                              </Button>
                              <span
                                className={cn(
                                  "w-8 text-center text-lg font-semibold tabular-nums",
                                  isLargeText && "text-xl"
                                )}
                              >
                                {item.quantity}
                              </span>
                              <Button
                                variant="outline"
                                size="icon"
                                className={cn("size-9", isLargeText && "size-10")}
                                disabled={maxReached}
                                onClick={() => {
                                  changeQuantity(item.productId, 1);
                                }}
                              >
                                <Plus className="size-4" aria-hidden="true" />
                              </Button>
                            </div>
                            <TypographyP
                              className={cn(
                                "w-full text-right text-base font-semibold tabular-nums",
                                isLargeText && "text-lg"
                              )}
                            >
                              {formatPrice(lineTotalCents, currencyCode)}
                            </TypographyP>
                            <Button
                              variant="ghost"
                              size="icon"
                              className={cn("size-9", isLargeText && "size-10")}
                              onClick={() => {
                                setPendingDeleteItem(item);
                              }}
                            >
                              <Trash2 className="size-4 text-destructive" aria-hidden="true" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="mt-4 flex items-center justify-between border-t pt-3">
                  <div className="flex items-center gap-2">
                    <TypographyMuted className={cn("text-lg font-medium", isLargeText && "text-xl")}>
                      Subtotal
                    </TypographyMuted>
                    <Badge
                      variant={itemCount > 0 ? "default" : "outline"}
                      className={cn(
                        "inline-flex size-9 items-center justify-center rounded-full p-0 text-sm font-semibold tabular-nums",
                        itemCount === 0 && "border-border bg-muted text-muted-foreground"
                      )}
                      aria-label={`${itemCount} item${itemCount === 1 ? "" : "s"}`}
                    >
                      {itemCount}
                    </Badge>
                  </div>
                  <TypographyP className={cn("text-2xl font-semibold tabular-nums", isLargeText && "text-3xl")}>
                    {formatPrice(subtotalCents, currencyCode)}
                  </TypographyP>
                </div>
                <div className="mt-4">
                  <Button
                    size="lg"
                    disabled={checkoutDisabled}
                    className={cn("w-full text-base", isLargeText && "text-lg")}
                    onClick={openPayDialog}
                  >
                    <Banknote data-icon="inline-start" aria-hidden="true" />
                    Pay
                  </Button>
                </div>
              </CardContent>
            </Card>
          </section>
        </div>
      ) : (
        <div className="flex min-h-[calc(100dvh-4rem-2rem)] flex-col pb-0 md:min-h-[calc(100dvh-4rem-3rem)]">
          <section className="grid min-h-0 flex-1 grid-cols-1 gap-3 xl:grid-cols-[minmax(340px,0.86fr)_minmax(0,1.14fr)]">
            <div className="grid min-h-0 grid-cols-1 gap-3">
              {shiftEnabled ? (
                <Card className="min-w-0">
                <CardHeader className="pb-3">
                  <CardTitle className={cn("text-base", isLargeText && "text-lg")}>
                    Shift Control
                  </CardTitle>
                  <CardDescription className={cn("text-xs", isLargeText && "text-sm")}>
                    Open shift before checkout.
                  </CardDescription>
                </CardHeader>
                  <div className="border-t" />
                  <CardContent className="space-y-3 pt-3">
                    <Badge
                      variant={isShiftOpen ? "secondary" : "outline"}
                      className={cn(isLargeText && "text-base")}
                    >
                      <Clock3 aria-hidden="true" />
                      {isShiftOpen ? "Shift Open" : "Shift Closed"}
                    </Badge>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        className={cn("text-sm", isLargeText && "h-11 text-base")}
                        disabled={isUpdatingShift || isShiftOpen}
                        onClick={() => {
                          void handleShiftAction("open");
                        }}
                      >
                        Open
                      </Button>
                      <Button
                        variant="outline"
                        className={cn("text-sm", isLargeText && "h-11 text-base")}
                        disabled={isUpdatingShift || !isShiftOpen}
                        onClick={() => {
                          void handleShiftAction("close");
                        }}
                      >
                        Close
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : null}

              <Card className="min-w-0">
                <CardHeader className="pb-3">
                  <CardTitle className={cn("text-base", isLargeText && "text-lg")}>
                    Inventory Actions
                  </CardTitle>
                  <CardDescription className={cn("text-xs", isLargeText && "text-sm")}>
                    Quick receive or adjust by SKU/barcode.
                  </CardDescription>
                </CardHeader>
                <div className="border-t" />
                <CardContent className="space-y-3 pt-3">
                  <Input
                    placeholder="SKU or Barcode"
                    className={cn(isLargeText && "h-11 text-base")}
                    value={inventoryCode}
                    onChange={(event) => {
                      setInventoryCode(event.target.value);
                    }}
                  />
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Input
                      type="number"
                      min={1}
                      placeholder="Quantity"
                      className={cn(isLargeText && "h-11 text-base")}
                      value={inventoryQty}
                      onChange={(event) => {
                        setInventoryQty(event.target.value);
                      }}
                    />
                    <div className="inline-flex rounded-md border p-1">
                      <Button
                        size="sm"
                        className={cn(isLargeText && "h-10 px-3 text-sm")}
                        variant={adjustmentDirection === "increase" ? "secondary" : "ghost"}
                        onClick={() => {
                          setAdjustmentDirection("increase");
                        }}
                      >
                        <PackagePlus data-icon="inline-start" aria-hidden="true" />
                        Increase
                      </Button>
                      <Button
                        size="sm"
                        className={cn(isLargeText && "h-10 px-3 text-sm")}
                        variant={adjustmentDirection === "decrease" ? "secondary" : "ghost"}
                        onClick={() => {
                          setAdjustmentDirection("decrease");
                        }}
                      >
                        <PackageMinus data-icon="inline-start" aria-hidden="true" />
                        Decrease
                      </Button>
                    </div>
                  </div>
                  <Input
                    placeholder="Reason"
                    className={cn(isLargeText && "h-11 text-base")}
                    value={inventoryReason}
                    onChange={(event) => {
                      setInventoryReason(event.target.value);
                    }}
                  />
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Button
                      className={cn("text-sm", isLargeText && "h-11 text-base")}
                      disabled={isSubmittingInventory}
                      onClick={() => {
                        void submitInventoryMovement("receive");
                      }}
                    >
                      <PackagePlus data-icon="inline-start" aria-hidden="true" />
                      Receive
                    </Button>
                    <Button
                      variant="outline"
                      className={cn("text-sm", isLargeText && "h-11 text-base")}
                      disabled={isSubmittingInventory}
                      onClick={() => {
                        void submitInventoryMovement("adjust");
                      }}
                    >
                      <ArrowLeftRight data-icon="inline-start" aria-hidden="true" />
                      Adjust
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="min-w-0 min-h-0 flex h-full flex-col">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className={cn("text-base", isLargeText && "text-lg")}>Related Stock</CardTitle>
                  <Badge
                    variant="outline"
                    className={cn("rounded-full tabular-nums", isLargeText && "text-base")}
                  >
                    {relatedStockMatches.length}
                  </Badge>
                </div>
                <CardDescription className={cn("text-xs", isLargeText && "text-sm")}>
                  Dynamic filter by name, SKU, barcode, or status.
                </CardDescription>
              </CardHeader>
              <div className="border-t" />
              <CardContent className="flex min-h-0 flex-1 flex-col gap-3 pt-3">
                <div className="relative">
                  <Search
                    className={cn(
                      "pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground",
                      isLargeText && "size-5"
                    )}
                    aria-hidden="true"
                  />
                  <Input
                    placeholder="Filter stock (name, SKU, barcode, sellable, out, blocked)"
                    className={cn("h-10 pl-10 text-sm", isLargeText && "h-12 text-base")}
                    value={relatedStockQuery}
                    onChange={(event) => {
                      setRelatedStockQuery(event.target.value);
                    }}
                  />
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className={cn(isLargeText && "text-sm")}>Product</TableHead>
                        <TableHead className={cn(isLargeText && "text-sm")}>SKU</TableHead>
                        <TableHead className={cn(isLargeText && "text-sm")}>Status</TableHead>
                        <TableHead className={cn("text-right", isLargeText && "text-sm")}>Stock</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {relatedStockMatches.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={4}
                            className={cn("py-8 text-center text-muted-foreground", isLargeText && "text-base")}
                          >
                            No product matches your filter.
                          </TableCell>
                        </TableRow>
                      ) : (
                        relatedStockMatches.map((product) => (
                          <TableRow key={product.id}>
                            <TableCell className={cn("font-medium", isLargeText && "text-base")}>
                              <p>{product.name}</p>
                              <p className={cn("text-xs text-muted-foreground", isLargeText && "text-sm")}>
                                {product.barcodes[0]?.code ?? "No barcode"}
                              </p>
                            </TableCell>
                            <TableCell className={cn("text-muted-foreground", isLargeText && "text-base")}>
                              {product.sku}
                            </TableCell>
                            <TableCell>
                              {product.isSellable ? (
                                <Badge
                                  variant={product.stockQty > 0 ? "secondary" : "outline"}
                                  className={cn(isLargeText && "text-sm")}
                                >
                                  {product.stockQty > 0 ? "Sellable" : "Out"}
                                </Badge>
                              ) : (
                                <Badge variant="destructive" className={cn(isLargeText && "text-sm")}>
                                  Blocked
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className={cn("text-right tabular-nums", isLargeText && "text-base")}>
                              {product.stockQty}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {approvalEnabled && (userRole === "MANAGER" || userRole === "OWNER") ? (
              <Card className="xl:col-span-2 min-h-0 flex flex-col">
                <CardHeader className="pb-3">
                  <CardTitle className={cn("text-base", isLargeText && "text-lg")}>
                    Pending Adjustment Approvals
                  </CardTitle>
                  <CardDescription className={cn("text-xs", isLargeText && "text-sm")}>
                    Review submitted stock adjustments.
                  </CardDescription>
                </CardHeader>
                <div className="border-t" />
                <CardContent className="min-h-0 flex-1 pt-3">
                  <div className="min-h-0 overflow-y-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className={cn(isLargeText && "text-sm")}>Product</TableHead>
                          <TableHead className={cn(isLargeText && "text-sm")}>Requested By</TableHead>
                          <TableHead className={cn(isLargeText && "text-sm")}>Delta</TableHead>
                          <TableHead className={cn("hidden lg:table-cell", isLargeText && "text-sm")}>
                            Reason
                          </TableHead>
                          <TableHead className={cn("text-right", isLargeText && "text-sm")}>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pendingAdjustments.length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={5}
                              className={cn("py-6 text-center text-muted-foreground", isLargeText && "text-base")}
                            >
                              No pending adjustments.
                            </TableCell>
                          </TableRow>
                        ) : (
                          pendingAdjustments.map((movement) => (
                            <TableRow key={movement.id}>
                              <TableCell className={cn("font-medium", isLargeText && "text-base")}>
                                {movement.product.name}
                                <p className={cn("text-xs text-muted-foreground", isLargeText && "text-sm")}>
                                  {movement.product.sku}
                                </p>
                              </TableCell>
                              <TableCell className={cn("text-muted-foreground", isLargeText && "text-base")}>
                                {movement.createdByUser.email}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={movement.quantityDelta >= 0 ? "secondary" : "outline"}
                                  className={cn(isLargeText && "text-sm")}
                                >
                                  {movement.quantityDelta > 0
                                    ? `+${movement.quantityDelta}`
                                    : movement.quantityDelta}
                                </Badge>
                              </TableCell>
                              <TableCell
                                className={cn(
                                  "hidden text-muted-foreground lg:table-cell",
                                  isLargeText && "text-base"
                                )}
                              >
                                {movement.reason}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="inline-flex gap-2">
                                  <Button
                                    size="sm"
                                    className={cn(isLargeText && "h-10 px-3 text-sm")}
                                    disabled={processingApprovalId === movement.id}
                                    onClick={() => {
                                      void submitAdjustmentApproval(movement.id, "approve");
                                    }}
                                  >
                                    Approve
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className={cn(isLargeText && "h-10 px-3 text-sm")}
                                    disabled={processingApprovalId === movement.id}
                                    onClick={() => {
                                      void submitAdjustmentApproval(movement.id, "reject");
                                    }}
                                  >
                                    Reject
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </section>
        </div>
      )}

      {workspaceMode === "sales" ? (
        <div className="fixed inset-x-0 bottom-0 z-30 hidden border-t bg-background/95 p-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:block lg:hidden">
          <div className="mx-auto flex w-full max-w-[1400px] items-center gap-3">
            <div className="min-w-0 flex-1">
              <TypographySmall className="text-sm text-muted-foreground">Cart Summary</TypographySmall>
              <TypographyP className={cn("text-lg font-semibold leading-6", isLargeText && "text-xl leading-7")}>
                Subtotal {formatPrice(subtotalCents, currencyCode)}
              </TypographyP>
            </div>
            <div className="flex flex-1">
              <Button
                size="lg"
                className={cn("w-full text-base", isLargeText && "text-lg")}
                disabled={checkoutDisabled}
                onClick={openPayDialog}
              >
                <Banknote data-icon="inline-start" aria-hidden="true" />
                Pay
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
