import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";

const dateFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "UTC",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function parseDateInput(value: string | null) {
  const normalized = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return null;
  }

  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function shiftDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function formatDateInput(date: Date) {
  return dateFormat.format(date);
}

function getDateRange(request: Request) {
  const url = new URL(request.url);
  const today = new Date();
  const defaultTo = new Date(Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate()
  ));
  const defaultFrom = shiftDays(defaultTo, -29);

  const parsedFrom = parseDateInput(url.searchParams.get("from"));
  const parsedTo = parseDateInput(url.searchParams.get("to"));

  let from = parsedFrom ?? defaultFrom;
  let to = parsedTo ?? defaultTo;

  if (from > to) {
    from = defaultFrom;
    to = defaultTo;
  }
  if (shiftDays(from, 366) < to) {
    from = shiftDays(to, -365);
  }

  return {
    from,
    fromInput: formatDateInput(from),
    to,
    toExclusive: shiftDays(to, 1),
    toInput: formatDateInput(to),
  };
}

function csvCell(value: string | number) {
  const text = String(value).replaceAll("\"", "\"\"");
  return `"${text}"`;
}

export async function GET(request: Request) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (sessionUser.role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const range = getDateRange(request);

  try {
    const sales = await prisma.sale.findMany({
      where: {
        createdAt: {
          gte: range.from,
          lt: range.toExclusive,
        },
      },
      orderBy: {
        createdAt: "asc",
      },
      select: {
        id: true,
        createdAt: true,
        paymentMethod: true,
        totalCents: true,
        soldByUser: {
          select: {
            email: true,
          },
        },
      },
    });

    const totalCents = sales.reduce((sum, sale) => sum + sale.totalCents, 0);
    const csvLines = [
      [
        "sale_id",
        "created_at_utc",
        "payment_method",
        "sold_by",
        "total_cents",
        "total_usd",
      ].join(","),
      ...sales.map((sale) =>
        [
          csvCell(sale.id),
          csvCell(sale.createdAt.toISOString()),
          csvCell(sale.paymentMethod),
          csvCell(sale.soldByUser.email),
          csvCell(sale.totalCents),
          csvCell((sale.totalCents / 100).toFixed(2)),
        ].join(",")
      ),
      [
        csvCell("SUMMARY"),
        csvCell(`${range.fromInput} to ${range.toInput}`),
        csvCell(""),
        csvCell(""),
        csvCell(totalCents),
        csvCell((totalCents / 100).toFixed(2)),
      ].join(","),
    ];

    const filename = `sales-report-${range.fromInput}-to-${range.toInput}.csv`;
    return new NextResponse(csvLines.join("\n"), {
      headers: {
        "cache-control": "no-store",
        "content-disposition": `attachment; filename="${filename}"`,
        "content-type": "text/csv; charset=utf-8",
      },
      status: 200,
    });
  } catch {
    return NextResponse.json(
      {
        error: "Unable to export report right now.",
      },
      { status: 500 }
    );
  }
}
