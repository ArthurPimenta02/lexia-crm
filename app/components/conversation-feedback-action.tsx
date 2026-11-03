"use client";

import { type FormEvent, useState } from "react";

import { useIdioma } from "@/app/components/idioma";

type FeedbackActionResult = {
  ok: boolean;
  error?: string;
};

type ConversationFeedbackActionProps = {
  appearance?: "dark" | "light";
  messageId: string;
  onSave: (
    messageId: string,
    categoria: string,
    observacao: string,
  ) => Promise<FeedbackActionResult>;
};

/*
 * A categoria é gravada no comentário do feedback tal como está aqui, em
 * pt-BR — é o valor. Só o texto que se vê no <option> é traduzido.
 */
const categories = [
  "Resposta errada",
  "Contexto perdido",
  "Tom inadequado",
  "Preço/serviço errado",
  "Handoff em falta",
  "Handoff indevido",
  "Outro",
];

export function ConversationFeedbackAction({
  appearance = "dark",
  messageId,
  onSave,
}: ConversationFeedbackActionProps) {
  const { t } = useIdioma();
  const [isOpen, setIsOpen] = useState(false);
  const [categoria, setCategoria] = useState(categories[0]);
  const [observacao, setObservacao] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const selectedCategory = categoria.trim();

    if (!selectedCategory) {
      setError(t("Selecione uma categoria."));
      return;
    }

    setIsSaving(true);
    setError(null);

    const result = await onSave(messageId, selectedCategory, observacao);

    setIsSaving(false);

    if (!result.ok) {
      setError(t(result.error ?? "Não foi possível registrar o feedback."));
      return;
    }

    setIsSaved(true);
    setIsOpen(false);
    setObservacao("");
  }

  if (isSaved && !isOpen) {
    return (
      <div
        className={`text-[10px] font-medium ${
          appearance === "light" ? "text-positive" : "text-primary-foreground"
        }`}
      >
        {t("Feedback registrado.")}
      </div>
    );
  }

  return (
    <div>
      {!isOpen ? (
        <button
          className={`rounded-full px-0 text-[10px] font-medium underline-offset-2 transition hover:underline ${
            appearance === "light"
              ? "text-muted-foreground hover:text-foreground"
              : "text-primary-foreground/65 hover:text-primary-foreground"
          }`}
          onClick={() => {
            setError(null);
            setIsOpen(true);
          }}
          type="button"
        >
          {t("Reportar")}
        </button>
      ) : (
        <form
          className="mt-3 rounded-xl border border-border bg-surface p-3 text-foreground shadow-[0_14px_35px_rgba(0,0,0,0.12)]"
          onSubmit={handleSubmit}
        >
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            {t("Categoria do problema")}
            <select
              className="ds-campo h-9 px-2 text-xs"
              onChange={(event) => setCategoria(event.target.value)}
              value={categoria}
            >
              {categories.map((item) => (
                <option key={item} value={item}>
                  {t(item)}
                </option>
              ))}
            </select>
          </label>

          <label className="mt-3 flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            {t("Observação")}
            <textarea
              className="ds-campo h-auto min-h-20 resize-y px-2 py-2 text-xs"
              onChange={(event) => setObservacao(event.target.value)}
              placeholder={t("Descreva o problema nesta resposta...")}
              value={observacao}
            />
          </label>

          {error ? (
            <p className="mt-2 text-xs font-medium text-danger">{error}</p>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="ds-botao ds-botao-primario ds-botao-p disabled:cursor-not-allowed"
              disabled={isSaving}
              type="submit"
            >
              {isSaving ? t("Salvando...") : t("Salvar feedback")}
            </button>
            <button
              className="ds-botao ds-botao-secundario ds-botao-p"
              disabled={isSaving}
              onClick={() => {
                setIsOpen(false);
                setError(null);
              }}
              type="button"
            >
              {t("Cancelar")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
