import React, { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Noto_Sans_Bengali } from "next/font/google";
import "./globals.css";
import "@/styles/niimbot-print.css";
import { AuthProvider } from "@/context/AuthContext";
import ServiceWorkerUpdater from "@/components/ServiceWorkerUpdater";
import NavProgress from "@/components/nav-progress";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const notoSansBengali = Noto_Sans_Bengali({
  variable: "--font-noto-bengali",
  subsets: ["bengali", "latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  interactiveWidget: "resizes-content",
  themeColor: "#ffffff",
  colorScheme: "light",
};

export const metadata: Metadata = {
  title: "Rizq POS — Store Management",
  description: "Point of Sale & Inventory Management for Rizq",
  manifest: "/manifest.json",
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${notoSansBengali.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col overflow-x-hidden bg-white text-gray-900">
        <Suspense fallback={null}>
          <NavProgress />
        </Suspense>
        <ServiceWorkerUpdater />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
