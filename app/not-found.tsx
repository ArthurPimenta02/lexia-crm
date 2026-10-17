import Link from "next/link";

import { LexiaBrand } from "@/app/components/lexia-brand";

/**
 * O ecrã de endereço inexistente.
 *
 * Sem este ficheiro, o Next mostra a sua página preta por omissão — que não
 * tem a marca, não tem forma de voltar ao painel e parece uma avaria do
 * servidor. Quem escreve mal um endereço precisa de uma porta de saída.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-background px-6 text-center">
      <LexiaBrand tone="light" />

      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Esta página não existe
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          O endereço pode ter mudado ou estar mal escrito.
        </p>
      </div>

      <Link
        className="h-10 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90"
        href="/"
      >
        Voltar ao início
      </Link>
    </main>
  );
}
