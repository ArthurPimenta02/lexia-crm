import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./design-system.css";

import { IdiomaProvider } from "@/app/components/idioma";
import { dicionarioDe } from "@/lib/i18n/dicionarios";
import { getIdioma, getTema } from "@/lib/i18n/servidor";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Lexia",
  description: "Plataforma Lexia",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [idioma, tema] = await Promise.all([getIdioma(), getTema()]);

  return (
    <html
      data-tema={tema}
      lang={idioma}
      className={`${geistSans.variable} ${geistMono.variable} h-full overflow-x-hidden antialiased`}
    >
      <body className="flex min-h-full w-full flex-col overflow-x-hidden">
        <IdiomaProvider dicionario={dicionarioDe(idioma)} idioma={idioma} tema={tema}>
          {children}
        </IdiomaProvider>
      </body>
    </html>
  );
}
