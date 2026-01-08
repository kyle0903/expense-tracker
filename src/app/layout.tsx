import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Navigation } from "@/components/Navigation";
import { AuthProvider } from "@/components/AuthProvider";
import { PinGate } from "@/components/PinGate";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Notion記帳",
  description: "個人記帳工具 — 與 Notion 連動",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-TW">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <AuthProvider>
          <PinGate>
            <main className="page-content">
              <div className="container">
                {children}
              </div>
            </main>
            <Navigation />
          </PinGate>
        </AuthProvider>
      </body>
    </html>
  );
}
