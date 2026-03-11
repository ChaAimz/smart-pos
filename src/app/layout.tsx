import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { getThemePrimaryHex } from "@/lib/store-setting";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Smart POS",
  description: "Container-ready POS starter with PostgreSQL and Prisma",
};

function getPrimaryForegroundHex(primaryHex: string) {
  const hex = primaryHex.startsWith("#") ? primaryHex.slice(1) : primaryHex;
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);

  if ([r, g, b].some((value) => Number.isNaN(value))) {
    return "#F6F7F8";
  }

  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.6 ? "#111315" : "#F6F7F8";
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const themePrimaryHex = await getThemePrimaryHex();
  const dynamicThemeStyles: CSSProperties = {
    "--primary": themePrimaryHex,
    "--primary-foreground": getPrimaryForegroundHex(themePrimaryHex),
    "--ring": themePrimaryHex,
  } as CSSProperties;

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        style={dynamicThemeStyles}
      >
        {children}
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
