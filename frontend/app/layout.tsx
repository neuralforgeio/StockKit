import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ThemeInit } from "@/components/theme-init";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "StockKit",
  description: "Multi-tenant business operations platform",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <ThemeInit />
        {children}
      </body>
    </html>
  );
}
