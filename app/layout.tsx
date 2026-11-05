import type { Metadata, Viewport } from "next";
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

/*
  `viewportFit: "cover"` deixa a página ir até debaixo da ilha e da barra de
  baixo do iPhone; sem ele, `env(safe-area-inset-*)` vale sempre 0 e o app não
  consegue afastar o cabeçalho do relógio (era por isso que o menu de cima não
  respondia ao toque dentro do app). O zoom continua permitido.
*/
export const viewport: Viewport = {
  initialScale: 1,
  interactiveWidget: "resizes-content",
  themeColor: [
    { color: "#ffffff", media: "(prefers-color-scheme: light)" },
    { color: "#000000", media: "(prefers-color-scheme: dark)" },
  ],
  viewportFit: "cover",
  width: "device-width",
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
