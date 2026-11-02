import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

import { NuqsAdapter } from "nuqs/adapters/next/app";
import { ThemeProvider } from "next-themes";

import { AuthProvider } from "@/contexts/AuthContext";
import ReactQueryProvider from "@/contexts/ReactQueryProvider";
import HotkeysProvider from "@/contexts/HotkeysProvider";
import { Toaster } from "@/components/ui/sonner";
import { LanguageProvider } from "@/lib/i18n/LanguageProvider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "CocaAPI Dashboard",
  description: "LiteLLM Proxy Admin UI",
  icons: { icon: "/get_favicon?v=cocaapi-20261102" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // next-themes stamps the theme class on <html> before paint, which the exported markup
    // cannot predict; suppressHydrationWarning confines that mismatch to this element.
    <html lang="zh-CN" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
          <LanguageProvider>
            <NuqsAdapter>
              <ReactQueryProvider>
                <HotkeysProvider>
                  <AuthProvider>{children}</AuthProvider>
                </HotkeysProvider>
                <Toaster />
              </ReactQueryProvider>
            </NuqsAdapter>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
