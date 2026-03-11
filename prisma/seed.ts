import bcrypt from "bcryptjs";
import {
  PrismaClient,
  type PaymentMethod,
  type UserRole,
} from "@prisma/client";

const prisma = new PrismaClient();

type SeedProduct = {
  costCents: number;
  name: string;
  sku: string;
  priceCents: number;
  stockQty: number;
  isSellable: boolean;
};

type SeedCatalogProduct = Omit<SeedProduct, "stockQty" | "isSellable">;

async function upsertDevUser(input: {
  email: string;
  password: string;
  role: UserRole;
}) {
  const passwordHash = await bcrypt.hash(input.password, 12);

  await prisma.user.upsert({
    where: { email: input.email },
    update: {
      passwordHash,
      role: input.role,
    },
    create: {
      email: input.email,
      passwordHash,
      role: input.role,
    },
  });
}

function seededFloat(seed: number) {
  const x = Math.sin(seed * 9_973) * 10_000;
  return x - Math.floor(x);
}

function seededInt(seed: number, min: number, max: number) {
  return Math.floor(seededFloat(seed) * (max - min + 1)) + min;
}

function pick<T>(items: T[], seed: number): T {
  return items[seededInt(seed, 0, items.length - 1)];
}

function deriveCostCents(priceCents: number, seed: number) {
  const ratioBasisPoints = seededInt(seed, 5800, 7800);
  return Math.max(0, Math.round((priceCents * ratioBasisPoints) / 10000));
}

function withInventory(product: SeedCatalogProduct, index: number): SeedProduct {
  if (index <= 5) {
    return {
      ...product,
      stockQty: seededInt(6_000 + index * 19, 12, 36),
      isSellable: true,
    };
  }

  const isSellable = seededInt(7_000 + index * 23, 1, 100) > 7;
  const stockQty = seededInt(8_000 + index * 29, 0, 48);

  return {
    ...product,
    stockQty: isSellable ? stockQty : 0,
    isSellable,
  };
}

function buildBarcodeCodes(sku: string, index: number): [string, string] {
  const normalizedSku = sku.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  const numericBody = String(900_000_000_000 + index * 97).slice(0, 12);
  const checksum = numericBody
    .split("")
    .reduce((sum, char, charIndex) => sum + Number(char) * (charIndex % 2 === 0 ? 1 : 3), 0);
  const ean13 = `${numericBody}${(10 - (checksum % 10)) % 10}`;

  return [`BC-${normalizedSku}`, ean13];
}

function buildMockProducts(): SeedProduct[] {
  const baseProductsRaw: Array<{ name: string; sku: string; priceCents: number }> = [
    { name: "Toasted Sandwich Ham & Cheese (Hot) 1 pc", sku: "SKU-CVS-0001", priceCents: 3900 },
    { name: "Toasted Sandwich Tuna Mayo (Hot) 1 pc", sku: "SKU-CVS-0002", priceCents: 4200 },
    { name: "Onigiri Salmon Soy 1 pc", sku: "SKU-CVS-0003", priceCents: 3200 },
    { name: "Onigiri Spicy Tuna 1 pc", sku: "SKU-CVS-0004", priceCents: 3200 },
    { name: "Pork Bun (Steamed) 1 pc", sku: "SKU-CVS-0005", priceCents: 2800 },
    { name: "Chicken Teriyaki Bento 1 tray", sku: "SKU-CVS-0006", priceCents: 6900 },
    { name: "Fried Rice Chicken Box 1 tray", sku: "SKU-CVS-0007", priceCents: 6500 },
    { name: "Instant Noodle Cup Seafood 60 g", sku: "SKU-CVS-0008", priceCents: 2200 },
    { name: "UHT Fresh Milk 225 ml", sku: "SKU-CVS-0009", priceCents: 1800 },
    { name: "Yogurt Drink Mixed Berry 180 ml", sku: "SKU-CVS-0010", priceCents: 2500 },
    { name: "Iced Green Tea Honey Lemon 450 ml", sku: "SKU-CVS-0011", priceCents: 2500 },
    { name: "Bottled Water Natural 600 ml", sku: "SKU-CVS-0012", priceCents: 1200 },
    { name: "Sparkling Soda Original 325 ml", sku: "SKU-CVS-0013", priceCents: 1700 },
    { name: "Potato Chips Original 48 g", sku: "SKU-CVS-0014", priceCents: 2900 },
    { name: "Seaweed Crispy Classic 32 g", sku: "SKU-CVS-0015", priceCents: 2600 },
    { name: "Chocolate Wafer Stick 40 g", sku: "SKU-CVS-0016", priceCents: 2200 },
    { name: "Gummy Fruit Mix 70 g", sku: "SKU-CVS-0017", priceCents: 2000 },
    { name: "Tissue Soft Pack 120 sheets", sku: "SKU-CVS-0018", priceCents: 3500 },
    { name: "Wet Wipes Antibacterial 20 pcs", sku: "SKU-CVS-0019", priceCents: 3300 },
    { name: "Toothpaste Cooling Mint 150 g", sku: "SKU-CVS-0020", priceCents: 5500 },
  ];
  const baseProducts: SeedCatalogProduct[] = baseProductsRaw.map((product, index) => ({
    ...product,
    costCents: deriveCostCents(product.priceCents, 500 + index * 37),
  }));

  const brands = [
    "Daily Choice",
    "Fresh Day",
    "Quick Bite",
    "Urban Snack",
    "Mini Mart",
    "Happy Meal",
    "Go Fresh",
    "Prime Select",
    "Easy Life",
    "Home Plus",
  ];
  const itemTypes = [
    "Rice Meal",
    "Sandwich",
    "Wrap",
    "Noodle Bowl",
    "Protein Shake",
    "Green Tea",
    "Coffee Latte",
    "Potato Chips",
    "Cracker",
    "Chocolate Bar",
    "Instant Soup",
    "Yogurt Cup",
    "Fruit Juice",
    "Energy Drink",
    "Sparkling Water",
    "Facial Tissue",
    "Laundry Pod",
    "Shower Gel",
    "Body Lotion",
    "Vitamin Water",
    "Biscuit",
    "Granola Bar",
    "Milk Tea",
    "Sausage Roll",
    "Fish Ball Snack",
  ];
  const flavors = [
    "Original",
    "Spicy",
    "Cheese",
    "Tom Yum",
    "Seaweed",
    "Chocolate",
    "Vanilla",
    "Strawberry",
    "Matcha",
    "Honey Lemon",
    "Salted Egg",
    "Barbecue",
    "Black Pepper",
    "Garlic",
    "Sea Salt",
    "Mango",
    "Lychee",
    "Grape",
    "Banana",
    "Mocha",
  ];
  const units = [
    "1 pc",
    "2 pcs",
    "4 pcs",
    "6 pcs",
    "8 pcs",
    "12 pcs",
    "30 g",
    "45 g",
    "60 g",
    "80 g",
    "120 g",
    "180 ml",
    "250 ml",
    "330 ml",
    "450 ml",
    "600 ml",
    "1 L",
  ];

  const generatedCount = 100 - baseProducts.length;
  const generatedProducts: SeedCatalogProduct[] = [];

  for (let i = 0; i < generatedCount; i += 1) {
    const index = baseProducts.length + i + 1;
    const brand = pick(brands, index * 3);
    const itemType = pick(itemTypes, index * 5);
    const flavor = pick(flavors, index * 7);
    const unit = pick(units, index * 11);
    const rawPrice = seededInt(index * 17, 1400, 12900);
    const priceCents = Math.round(rawPrice / 100) * 100;

    generatedProducts.push({
      costCents: deriveCostCents(priceCents, index * 19),
      name: `${brand} ${itemType} ${flavor} ${unit}`,
      sku: `SKU-CVS-${String(index).padStart(4, "0")}`,
      priceCents,
    });
  }

  return [...baseProducts, ...generatedProducts].map((product, index) =>
    withInventory(product, index + 1)
  );
}

async function ensureDevUsers() {
  const ownerEmail = (process.env.SEED_ADMIN_EMAIL ?? "admin@smartpos.local")
    .trim()
    .toLowerCase();
  const ownerPassword = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";
  const salesEmail = (process.env.SEED_SALES_EMAIL ?? "sales@smartpos.local")
    .trim()
    .toLowerCase();
  const salesPassword = process.env.SEED_SALES_PASSWORD ?? "ChangeMe123!";
  const managerEmail = (process.env.SEED_MANAGER_EMAIL ?? "manager@smartpos.local")
    .trim()
    .toLowerCase();
  const managerPassword = process.env.SEED_MANAGER_PASSWORD ?? "ChangeMe123!";

  await upsertDevUser({
    email: ownerEmail,
    password: ownerPassword,
    role: "OWNER",
  });
  await upsertDevUser({
    email: managerEmail,
    password: managerPassword,
    role: "MANAGER",
  });
  await upsertDevUser({
    email: salesEmail,
    password: salesPassword,
    role: "SALES",
  });
}

async function ensureSeedProducts() {
  const products = buildMockProducts();

  for (const [index, product] of products.entries()) {
    const upserted = await prisma.product.upsert({
      where: { sku: product.sku },
      update: {
        costCents: product.costCents,
        name: product.name,
        priceCents: product.priceCents,
        stockQty: product.stockQty,
        isSellable: product.isSellable,
      },
      create: product,
      select: {
        id: true,
        sku: true,
      },
    });

    const [primaryCode, secondaryCode] = buildBarcodeCodes(upserted.sku, index + 1);
    const barcodePairs: Array<{ code: string; isPrimary: boolean }> = [
      { code: primaryCode, isPrimary: true },
      { code: secondaryCode, isPrimary: false },
    ];

    for (const barcode of barcodePairs) {
      await prisma.productBarcode.upsert({
        where: { code: barcode.code },
        update: {
          productId: upserted.id,
          isPrimary: barcode.isPrimary,
        },
        create: {
          productId: upserted.id,
          code: barcode.code,
          isPrimary: barcode.isPrimary,
        },
        select: {
          id: true,
        },
      });
    }
  }
}

async function getDefaultSoldByUserId(): Promise<string> {
  const preferredSalesEmail = (process.env.SEED_SALES_EMAIL ?? "sales@smartpos.local")
    .trim()
    .toLowerCase();
  const preferredSalesUser = await prisma.user.findUnique({
    where: { email: preferredSalesEmail },
    select: {
      id: true,
    },
  });

  if (preferredSalesUser) {
    return preferredSalesUser.id;
  }

  const fallbackSalesUser = await prisma.user.findFirst({
    where: { role: "SALES" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
    },
  });
  if (fallbackSalesUser) {
    return fallbackSalesUser.id;
  }

  const fallbackUser = await prisma.user.findFirst({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
    },
  });
  if (!fallbackUser) {
    throw new Error("No users available for Sale.soldByUserId.");
  }

  return fallbackUser.id;
}

async function ensureSeedSale(soldByUserId: string) {
  const saleCount = await prisma.sale.count();
  if (saleCount !== 0) {
    return;
  }

  const first = await prisma.product.findUniqueOrThrow({
    where: { sku: "SKU-CVS-0001" },
  });
  const second = await prisma.product.findUniqueOrThrow({
    where: { sku: "SKU-CVS-0002" },
  });

  const totalCents = first.priceCents + second.priceCents;

  await prisma.sale.create({
    data: {
      totalCents,
      paymentMethod: "CASH",
      soldByUserId,
      items: {
        create: [
          {
            productId: first.id,
            quantity: 1,
            unitPriceCents: first.priceCents,
          },
          {
            productId: second.id,
            quantity: 1,
            unitPriceCents: second.priceCents,
          },
        ],
      },
    },
  });
}

async function ensureMockSalesHistory(soldByUserId: string) {
  const targetSaleCount = Number(process.env.SEED_MOCK_SALES ?? "35");
  const currentSaleCount = await prisma.sale.count();
  if (currentSaleCount >= targetSaleCount) {
    return;
  }

  const products = await prisma.product.findMany({
    select: {
      id: true,
      priceCents: true,
    },
    orderBy: { sku: "asc" },
  });

  if (products.length === 0) {
    return;
  }

  const now = Date.now();
  const maxDaysBackMs = 1000 * 60 * 60 * 24 * 21;
  const paymentMethods: PaymentMethod[] = ["CASH", "QR_CODE", "CREDIT_CARD"];

  for (let saleIndex = currentSaleCount; saleIndex < targetSaleCount; saleIndex += 1) {
    const uniqueCount = seededInt(1000 + saleIndex * 13, 1, 4);
    const selectedProductIds = new Set<string>();

    while (selectedProductIds.size < uniqueCount) {
      const product = pick(products, 2000 + saleIndex * 17 + selectedProductIds.size * 19);
      selectedProductIds.add(product.id);
    }

    const lineItems = [...selectedProductIds].map((productId, idx) => {
      const product = products.find((item) => item.id === productId);
      if (!product) {
        throw new Error("Unable to build mock sale line item.");
      }

      return {
        productId,
        quantity: seededInt(3000 + saleIndex * 23 + idx * 29, 1, 3),
        unitPriceCents: product.priceCents,
      };
    });

    const totalCents = lineItems.reduce(
      (sum, item) => sum + item.quantity * item.unitPriceCents,
      0
    );
    const createdAt = new Date(now - seededInt(4000 + saleIndex * 31, 0, maxDaysBackMs));
    const paymentMethod = pick(paymentMethods, 5000 + saleIndex * 37);

    await prisma.sale.create({
      data: {
        createdAt,
        paymentMethod,
        soldByUserId,
        totalCents,
        items: {
          create: lineItems,
        },
      },
      select: {
        id: true,
      },
    });
  }
}

async function main() {
  await ensureDevUsers();
  await ensureSeedProducts();
  const soldByUserId = await getDefaultSoldByUserId();
  await ensureSeedSale(soldByUserId);
  await ensureMockSalesHistory(soldByUserId);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
