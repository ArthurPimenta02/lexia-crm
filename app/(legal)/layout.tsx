import Link from "next/link";

import "./legal.css";

/*
  Páginas legais públicas (sem login), pedidas pela Meta para o app da Lexia
  (13/11). O site uselexia.app é montado por JavaScript e o robô da Meta não
  vê o texto; aqui o texto vem já no HTML. Em inglês: é quem revê o app.
*/
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-12 text-[15px] leading-relaxed text-foreground">
      <p className="mb-10 text-lg font-semibold tracking-tight">Lexia AI</p>
      <article className="legal space-y-4">{children}</article>
      <nav className="mt-14 flex flex-wrap gap-5 border-t pt-6 text-sm text-muted-foreground">
        <Link href="/privacy">Privacy Policy</Link>
        <Link href="/terms">Terms of Service</Link>
        <Link href="/data-deletion">Data Deletion</Link>
        <a href="mailto:suporte@uselexia.app">suporte@uselexia.app</a>
      </nav>
    </main>
  );
}
