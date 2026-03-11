import { Prisma } from "@prisma/client";
import { CircleSlash, ShieldCheck } from "lucide-react";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Link from "next/link";

import { OwnerShell } from "@/components/layout/owner-shell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { FlashToast } from "@/components/ui/flash-toast";
import { Input } from "@/components/ui/input";
import { requireOwnerSession } from "@/lib/owner-session";
import { prisma } from "@/lib/prisma";
import { type StoreCurrencyCode } from "@/lib/currency";
import { getStoreCurrencyCode } from "@/lib/store-setting";
import { ProductsVirtualTable } from "./products-virtual-table";

type OwnerProductsPageProps = {
  searchParams: Promise<{
    dialog?: string;
    error?: string;
    item?: string;
    q?: string;
    status?: string;
  }>;
};

type ProductRow = {
  costCents: number;
  id: string;
  isSellable: boolean;
  name: string;
  primaryBarcode: string | null;
  priceCents: number;
  sku: string;
  stockQty: number;
  updatedAt: Date;
};

type ProductData = {
  currencyCode: StoreCurrencyCode;
  hasMoreProducts: boolean;
  matchingProductsCount: number;
  products: ProductRow[];
  sellableCount: number;
  totalCount: number;
};

type ProductDialogMode = "new" | "edit" | "delete";

type ProductDialogItem = {
  costCents: number;
  id: string;
  isSellable: boolean;
  name: string;
  priceCents: number;
  primaryBarcode: string | null;
  stockQty: number;
};

const statusMessages: Record<string, string> = {
  product_created: "Product created.",
  product_deleted: "Product deleted.",
  product_updated: "Product updated.",
};

const errorMessages: Record<string, string> = {
  duplicate_barcode: "Barcode already exists.",
  duplicate_sku: "Unable to generate unique internal product code. Please retry.",
  invalid_fields: "Please provide valid name, primary barcode, cost, and price.",
  invalid_product: "Product not found.",
  product_in_use: "Cannot delete product with sales or inventory history. Block it instead.",
};

const updatedAtFormat = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});
const PRODUCTS_PAGE_SIZE = 60;

function buildProductWhere(query: string): Prisma.ProductWhereInput | undefined {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    return undefined;
  }

  return {
    OR: [
      { name: { contains: normalizedQuery, mode: "insensitive" } },
      { sku: { contains: normalizedQuery, mode: "insensitive" } },
      {
        barcodes: {
          some: {
            isPrimary: true,
            code: { contains: normalizedQuery, mode: "insensitive" },
          },
        },
      },
    ],
  };
}

function normalizeBarcodeCode(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}

function isValidBarcodeCode(code: string) {
  return /^[A-Z0-9-_.]{3,64}$/.test(code);
}

function createAutoSkuCandidate(barcodeCode: string) {
  const normalizedBarcode = barcodeCode.replace(/[^A-Z0-9]/g, "");
  const barcodePart = normalizedBarcode.slice(-18) || "ITEM";
  const uniquePart = `${Date.now().toString(36)}${Math.random()
    .toString(36)
    .slice(2, 8)}`.toUpperCase();
  return `SKU-AUTO-${barcodePart}-${uniquePart}`;
}

async function generateUniqueProductSku(
  tx: Prisma.TransactionClient,
  barcodeCode: string
) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = createAutoSkuCandidate(barcodeCode);
    const existing = await tx.product.findUnique({
      where: { sku: candidate },
      select: { id: true },
    });
    if (!existing) {
      return candidate;
    }
  }

  return null;
}

function getUniqueConstraintTargets(error: Prisma.PrismaClientKnownRequestError) {
  const target = error.meta?.target;
  if (Array.isArray(target)) {
    return target.map((value) => String(value));
  }
  if (typeof target === "string") {
    return [target];
  }
  return [];
}

function parsePriceCents(value: FormDataEntryValue | null): number | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function parseCostCents(value: FormDataEntryValue | null): number | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

function parseBooleanFlag(value: FormDataEntryValue | null): boolean | null {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }

  return null;
}

function revalidateOwnerProductRelatedPaths() {
  revalidatePath("/");
  revalidatePath("/owner");
  revalidatePath("/owner/activity");
  revalidatePath("/owner/products");
  revalidatePath("/sales");
}

async function createProductAction(formData: FormData) {
  "use server";

  await requireOwnerSession();

  const name = String(formData.get("name") ?? "").trim();
  const primaryBarcode = normalizeBarcodeCode(formData.get("primaryBarcode"));
  const costCents = parseCostCents(formData.get("costCents"));
  const priceCents = parsePriceCents(formData.get("priceCents"));
  const isSellable = parseBooleanFlag(formData.get("isSellable"));

  if (
    name.length < 2 ||
    !isValidBarcodeCode(primaryBarcode) ||
    costCents == null ||
    priceCents == null ||
    isSellable == null
  ) {
    redirect("/owner/products?error=invalid_fields");
  }

  try {
    await prisma.$transaction(async (tx) => {
      const generatedSku = await generateUniqueProductSku(tx, primaryBarcode);
      if (!generatedSku) {
        throw new Error("sku_generation_failed");
      }

      await tx.product.create({
        data: {
          costCents,
          isSellable,
          name,
          priceCents,
          sku: generatedSku,
          barcodes: {
            create: {
              code: primaryBarcode,
              isPrimary: true,
            },
          },
        },
        select: {
          id: true,
        },
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "sku_generation_failed") {
      redirect("/owner/products?error=duplicate_sku");
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const targets = getUniqueConstraintTargets(error);
      if (targets.some((target) => target.toLowerCase().includes("code"))) {
        redirect("/owner/products?error=duplicate_barcode");
      }
      redirect("/owner/products?error=duplicate_sku");
    }

    throw error;
  }

  revalidateOwnerProductRelatedPaths();
  redirect("/owner/products?status=product_created");
}

async function updateProductAction(formData: FormData) {
  "use server";

  const sessionUser = await requireOwnerSession();

  const productId = String(formData.get("productId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const costCents = parseCostCents(formData.get("costCents"));
  const priceCents = parsePriceCents(formData.get("priceCents"));
  const isSellable = parseBooleanFlag(formData.get("isSellable"));

  if (!productId || name.length < 2 || costCents == null || priceCents == null || isSellable == null) {
    redirect("/owner/products?error=invalid_fields");
  }

  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.product.findUnique({
        where: { id: productId },
        select: {
          costCents: true,
          id: true,
          priceCents: true,
          sku: true,
        },
      });

      if (!existing) {
        throw new Error("invalid_product");
      }

      await tx.product.update({
        where: { id: productId },
        data: {
          costCents,
          isSellable,
          name,
          priceCents,
        },
        select: {
          id: true,
        },
      });

      if (existing.costCents !== costCents || existing.priceCents !== priceCents) {
        await tx.productPriceLog.create({
          data: {
            changedByUserId: sessionUser.userId,
            nextCostCents: costCents,
            nextPriceCents: priceCents,
            previousCostCents: existing.costCents,
            previousPriceCents: existing.priceCents,
            productId: existing.id,
            productName: name,
            sku: existing.sku,
          },
          select: {
            id: true,
          },
        });
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message === "invalid_product") {
      redirect("/owner/products?error=invalid_product");
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      redirect("/owner/products?error=invalid_product");
    }

    throw error;
  }

  revalidateOwnerProductRelatedPaths();
  redirect("/owner/products?status=product_updated");
}

async function deleteProductAction(formData: FormData) {
  "use server";

  await requireOwnerSession();

  const productId = String(formData.get("productId") ?? "").trim();
  if (!productId) {
    redirect("/owner/products?error=invalid_product");
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.productBarcode.deleteMany({
        where: { productId },
      });

      await tx.product.delete({
        where: { id: productId },
        select: {
          id: true,
        },
      });
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      redirect("/owner/products?error=invalid_product");
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2003" || error.code === "P2014")
    ) {
      redirect("/owner/products?error=product_in_use");
    }

    throw error;
  }

  revalidateOwnerProductRelatedPaths();
  redirect("/owner/products?status=product_deleted");
}

async function getProductData(query: string): Promise<ProductData> {
  try {
    const currencyCodePromise = getStoreCurrencyCode();
    const productWhere = buildProductWhere(query);

    const [rawProducts, totalCount, sellableCount, matchingProductsCount] = await prisma.$transaction([
      prisma.product.findMany({
        where: productWhere,
        orderBy: { updatedAt: "desc" },
        select: {
          barcodes: {
            where: { isPrimary: true },
            orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
            select: {
              code: true,
            },
            take: 1,
          },
          id: true,
          isSellable: true,
          name: true,
          costCents: true,
          priceCents: true,
          sku: true,
          stockQty: true,
          updatedAt: true,
        },
        take: PRODUCTS_PAGE_SIZE + 1,
      }),
      prisma.product.count(),
      prisma.product.count({ where: { isSellable: true } }),
      prisma.product.count({ where: productWhere }),
    ]);

    const hasMoreProducts = rawProducts.length > PRODUCTS_PAGE_SIZE;
    const firstPageProducts = hasMoreProducts
      ? rawProducts.slice(0, PRODUCTS_PAGE_SIZE)
      : rawProducts;

    const products: ProductRow[] = firstPageProducts.map((product) => ({
      id: product.id,
      isSellable: product.isSellable,
      name: product.name,
      primaryBarcode: product.barcodes[0]?.code ?? null,
      costCents: product.costCents,
      priceCents: product.priceCents,
      sku: product.sku,
      stockQty: product.stockQty,
      updatedAt: product.updatedAt,
    }));

    return {
      currencyCode: await currencyCodePromise,
      hasMoreProducts,
      matchingProductsCount,
      products,
      sellableCount,
      totalCount,
    };
  } catch {
    return {
      currencyCode: "ZAR",
      hasMoreProducts: false,
      matchingProductsCount: 0,
      products: [],
      sellableCount: 0,
      totalCount: 0,
    };
  }
}

function toDialogMode(value: string | undefined): ProductDialogMode | null {
  if (value === "new" || value === "edit" || value === "delete") {
    return value;
  }
  return null;
}

function buildProductsPageHref(input: {
  dialog?: ProductDialogMode | null;
  item?: string | null;
  q?: string;
}) {
  const params = new URLSearchParams();
  const query = (input.q ?? "").trim();
  if (query) {
    params.set("q", query);
  }
  if (input.dialog) {
    params.set("dialog", input.dialog);
  }
  const itemId = (input.item ?? "").trim();
  if (input.dialog && input.dialog !== "new" && itemId) {
    params.set("item", itemId);
  }

  const search = params.toString();
  return search ? `/owner/products?${search}` : "/owner/products";
}

async function getProductDialogItem(productId: string): Promise<ProductDialogItem | null> {
  if (!productId) {
    return null;
  }

  return prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      isSellable: true,
      name: true,
      costCents: true,
      priceCents: true,
      stockQty: true,
      barcodes: {
        where: {
          isPrimary: true,
        },
        select: {
          code: true,
        },
        take: 1,
      },
    },
  }).then((product) => {
    if (!product) {
      return null;
    }

    return {
      id: product.id,
      isSellable: product.isSellable,
      name: product.name,
      costCents: product.costCents,
      priceCents: product.priceCents,
      primaryBarcode: product.barcodes[0]?.code ?? null,
      stockQty: product.stockQty,
    };
  });
}

export default async function OwnerProductsPage({
  searchParams,
}: OwnerProductsPageProps) {
  const sessionUser = await requireOwnerSession();
  const params = await searchParams;
  const query = String(params.q ?? "").trim();
  const data = await getProductData(query);
  const dialogMode = toDialogMode(params.dialog);
  const dialogItemId = String(params.item ?? "").trim();
  const dialogItem =
    dialogMode && dialogMode !== "new"
      ? await getProductDialogItem(dialogItemId)
      : null;
  const closeDialogHref = buildProductsPageHref({ q: query });

  const statusMessage = params.status ? statusMessages[params.status] : undefined;
  const errorMessage = params.error ? errorMessages[params.error] : undefined;
  const blockedCount = Math.max(data.totalCount - data.sellableCount, 0);

  return (
    <OwnerShell
      activeNav="products"
      mainClassName="h-[calc(100dvh-3.5rem)] min-h-0 overflow-hidden"
      pageTitle="Products"
      userEmail={sessionUser.email}
    >
      <FlashToast
        id={params.status ? `owner-products-status:${params.status}` : undefined}
        message={statusMessage}
        variant="success"
      />
      <FlashToast
        id={params.error ? `owner-products-error:${params.error}` : undefined}
        message={errorMessage}
        variant="error"
      />

      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <section className="shrink-0 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card className="py-4">
            <CardHeader>
              <CardDescription>Total Products</CardDescription>
              <CardTitle className="text-3xl">{data.totalCount}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="py-4">
            <CardHeader>
              <CardDescription>Sellable</CardDescription>
              <CardTitle className="text-3xl">{data.sellableCount}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="py-4">
            <CardHeader>
              <CardDescription>Blocked</CardDescription>
              <CardTitle className="text-3xl">{blockedCount}</CardTitle>
            </CardHeader>
          </Card>
        </section>

        <Card className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden">
          <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden pt-4">
            <ProductsVirtualTable
              key={query || "__all_products__"}
              currencyCode={data.currencyCode}
              hasMore={data.hasMoreProducts}
              initialQuery={query}
              matchingProductsCount={data.matchingProductsCount}
              products={data.products.map((product) => ({
                costCents: product.costCents,
                id: product.id,
                isSellable: product.isSellable,
                name: product.name,
                primaryBarcode: product.primaryBarcode,
                priceCents: product.priceCents,
                stockQty: product.stockQty,
                updatedAtLabel: updatedAtFormat.format(product.updatedAt),
              }))}
            />
          </CardContent>
        </Card>
      </div>

      {dialogMode ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" />
          <div className="relative z-10 w-full max-w-2xl overflow-hidden rounded-xl border border-border bg-background shadow-2xl">
            {dialogMode === "new" ? (
              <>
                <div className="flex items-start justify-between gap-3 px-5 py-4">
                  <div>
                    <h2 className="text-lg font-semibold">New Item</h2>
                    <p className="text-sm text-muted-foreground">
                      Create a new product with barcode-first setup.
                    </p>
                  </div>
                  <Button asChild variant="ghost" size="sm">
                    <Link href={closeDialogHref}>Close</Link>
                  </Button>
                </div>
                <div className="border-t" />
                <form action={createProductAction} className="grid grid-cols-1 gap-4 p-5">
                  <FieldGroup className="gap-4">
                    <Field className="gap-2">
                      <FieldLabel htmlFor="dialog-new-name">Product Name</FieldLabel>
                      <Input
                        id="dialog-new-name"
                        name="name"
                        className="h-11"
                        placeholder="Product name"
                        required
                      />
                    </Field>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
                      <Field className="gap-2">
                        <FieldLabel htmlFor="dialog-new-primary-barcode">
                          Primary Barcode
                        </FieldLabel>
                        <Input
                          id="dialog-new-primary-barcode"
                          name="primaryBarcode"
                          className="h-11"
                          placeholder="8850000123456"
                          required
                        />
                      </Field>
                      <Field className="gap-2">
                        <FieldLabel htmlFor="dialog-new-cost">Cost (Cents)</FieldLabel>
                        <Input
                          id="dialog-new-cost"
                          name="costCents"
                          className="h-11"
                          type="number"
                          min={0}
                          step={1}
                          placeholder="2500"
                          required
                        />
                      </Field>
                      <Field className="gap-2">
                        <FieldLabel htmlFor="dialog-new-price">Price (Cents)</FieldLabel>
                        <Input
                          id="dialog-new-price"
                          name="priceCents"
                          className="h-11"
                          type="number"
                          min={1}
                          step={1}
                          placeholder="3900"
                          required
                        />
                      </Field>
                    </div>
                  </FieldGroup>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button asChild type="button" variant="outline">
                      <Link href={closeDialogHref}>Cancel</Link>
                    </Button>
                    <Button type="submit" name="isSellable" value="false" variant="outline">
                      <CircleSlash className="size-4" aria-hidden="true" />
                      Create Blocked
                    </Button>
                    <Button type="submit" name="isSellable" value="true">
                      <ShieldCheck className="size-4" aria-hidden="true" />
                      Create Sellable
                    </Button>
                  </div>
                </form>
              </>
            ) : null}

            {dialogMode === "edit" ? (
              dialogItem ? (
                <>
                  <div className="flex items-start justify-between gap-3 px-5 py-4">
                    <div>
                      <h2 className="text-lg font-semibold">Edit Item</h2>
                      <p className="text-sm text-muted-foreground">
                        Update item details and sale status.
                      </p>
                    </div>
                    <Button asChild variant="ghost" size="sm">
                      <Link href={closeDialogHref}>Close</Link>
                    </Button>
                  </div>
                  <div className="border-t" />
                  <form action={updateProductAction} className="grid grid-cols-1 gap-4 p-5">
                    <input type="hidden" name="productId" value={dialogItem.id} />
                    <FieldGroup className="gap-4">
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
                        <Field className="gap-2">
                          <FieldLabel htmlFor="dialog-edit-name">Product Name</FieldLabel>
                          <Input
                            id="dialog-edit-name"
                            name="name"
                            defaultValue={dialogItem.name}
                            required
                          />
                        </Field>
                        <Field className="gap-2">
                          <FieldLabel htmlFor="dialog-edit-cost">Cost (Cents)</FieldLabel>
                          <Input
                            id="dialog-edit-cost"
                            name="costCents"
                            type="number"
                            min={0}
                            step={1}
                            defaultValue={dialogItem.costCents}
                            required
                          />
                        </Field>
                        <Field className="gap-2">
                          <FieldLabel htmlFor="dialog-edit-price">Price (Cents)</FieldLabel>
                          <Input
                            id="dialog-edit-price"
                            name="priceCents"
                            type="number"
                            min={1}
                            step={1}
                            defaultValue={dialogItem.priceCents}
                            required
                          />
                        </Field>
                      </div>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <Field className="gap-2">
                          <FieldLabel>Primary Barcode</FieldLabel>
                          <Input
                            value={dialogItem.primaryBarcode ?? "No primary barcode"}
                            disabled
                          />
                        </Field>
                        <Field className="gap-2">
                          <FieldLabel>Stock Qty</FieldLabel>
                          <Input value={String(dialogItem.stockQty)} disabled />
                        </Field>
                      </div>
                    </FieldGroup>
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button asChild type="button" variant="outline">
                        <Link href={closeDialogHref}>Cancel</Link>
                      </Button>
                      <Button type="submit" name="isSellable" value="false" variant="outline">
                        Save as Blocked
                      </Button>
                      <Button type="submit" name="isSellable" value="true">
                        Save as Sellable
                      </Button>
                    </div>
                  </form>
                </>
              ) : (
                <>
                  <div className="px-5 py-4">
                    <h2 className="text-lg font-semibold">Edit Item</h2>
                    <p className="text-sm text-muted-foreground">
                      Selected item not found.
                    </p>
                  </div>
                  <div className="border-t" />
                  <div className="flex justify-end p-5">
                    <Button asChild variant="outline">
                      <Link href={closeDialogHref}>Close</Link>
                    </Button>
                  </div>
                </>
              )
            ) : null}

            {dialogMode === "delete" ? (
              dialogItem ? (
                <>
                  <div className="flex items-start justify-between gap-3 px-5 py-4">
                    <div>
                      <h2 className="text-lg font-semibold">Delete Item</h2>
                      <p className="text-sm text-muted-foreground">
                        This action removes this item from the catalog.
                      </p>
                    </div>
                    <Button asChild variant="ghost" size="sm">
                      <Link href={closeDialogHref}>Close</Link>
                    </Button>
                  </div>
                  <div className="border-t" />
                  <form action={deleteProductAction} className="grid grid-cols-1 gap-4 p-5">
                    <input type="hidden" name="productId" value={dialogItem.id} />
                    <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">
                      <p className="font-medium">{dialogItem.name}</p>
                      <p className="text-muted-foreground">
                        Primary barcode: {dialogItem.primaryBarcode ?? "No primary barcode"}
                      </p>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button asChild type="button" variant="outline">
                        <Link href={closeDialogHref}>Cancel</Link>
                      </Button>
                      <Button type="submit" variant="destructive">
                        Confirm Delete
                      </Button>
                    </div>
                  </form>
                </>
              ) : (
                <>
                  <div className="px-5 py-4">
                    <h2 className="text-lg font-semibold">Delete Item</h2>
                    <p className="text-sm text-muted-foreground">
                      Selected item not found.
                    </p>
                  </div>
                  <div className="border-t" />
                  <div className="flex justify-end p-5">
                    <Button asChild variant="outline">
                      <Link href={closeDialogHref}>Close</Link>
                    </Button>
                  </div>
                </>
              )
            ) : null}
          </div>
        </div>
      ) : null}
    </OwnerShell>
  );
}
