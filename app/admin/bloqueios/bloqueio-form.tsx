"use client";

import { useActionState } from "react";

import { adicionarBloqueio, type BloqueioState } from "@/app/admin/bloqueios/actions";

const inicial: BloqueioState = { message: null, type: null };
const classeInput =
  "h-10 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-foreground outline-none transition focus:border-foreground";
// O navegador não deve preencher nada aqui (ver a página de Conexões).
const semAutopreencher = {
  autoComplete: "off",
  "data-1p-ignore": "true",
  "data-lpignore": "true",
  "data-bwignore": "true",
  "data-form-type": "other",
} as const;

export function BloqueioForm({ clienteSlug }: { clienteSlug: string }) {
  const acao = adicionarBloqueio.bind(null, clienteSlug);
  const [estado, formAction, pendente] = useActionState(acao, inicial);

  return (
    <form
      action={formAction}
      autoComplete="off"
      className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5"
    >
      <div>
        <h2 className="text-sm font-semibold text-foreground">Bloquear um contacto</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          WhatsApp: cole o número com o código do país. Instagram e Messenger: mais fácil pelo botão
          &quot;Bloquear contacto&quot; dentro da conversa.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-[160px_1fr_1fr_1fr]">
        <select className={classeInput} defaultValue="whatsapp" name="canal">
          <option value="whatsapp">WhatsApp</option>
          <option value="instagram">Instagram</option>
          <option value="messenger">Messenger</option>
        </select>
        <input {...semAutopreencher} className={classeInput} name="identificador" placeholder="Número ou ID da conta" required />
        <input {...semAutopreencher} className={classeInput} name="nome" placeholder="Nome (ex.: Ana, família)" />
        <input {...semAutopreencher} className={classeInput} name="motivo" placeholder="Motivo (opcional)" />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90 active:scale-[0.98] disabled:opacity-60"
          disabled={pendente}
          type="submit"
        >
          {pendente ? "Gravando..." : "Bloquear"}
        </button>
        {estado.message ? (
          <span className={`text-sm ${estado.type === "error" ? "text-danger" : "text-positive"}`}>
            {estado.message}
          </span>
        ) : null}
      </div>
    </form>
  );
}
