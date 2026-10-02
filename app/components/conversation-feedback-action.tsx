"use client";

import { type FormEvent, useState } from "react";

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
      setError("Selecciona uma categoria.");
      return;
    }

    setIsSaving(true);
    setError(null);

    const result = await onSave(messageId, selectedCategory, observacao);

    setIsSaving(false);

    if (!result.ok) {
      setError(result.error ?? "Não foi possível registar o feedback.");
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
          appearance === "light" ? "text-emerald-700" : "text-emerald-300"
        }`}
      >
        Feedback registado.
      </div>
    );
  }

  return (
    <div>
      {!isOpen ? (
        <button
          className={`rounded-full px-0 text-[10px] font-medium underline-offset-2 transition hover:underline ${
            appearance === "light"
              ? "text-zinc-500 hover:text-zinc-800"
              : "text-white/65 hover:text-white"
          }`}
          onClick={() => {
            setError(null);
            setIsOpen(true);
          }}
          type="button"
        >
          Reportar
        </button>
      ) : (
        <form
          className="mt-3 rounded-xl border border-zinc-200 bg-white p-3 text-zinc-900 shadow-[0_14px_35px_rgba(0,0,0,0.12)]"
          onSubmit={handleSubmit}
        >
          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-700">
            Categoria do problema
            <select
              className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-xs outline-none transition focus:border-zinc-900"
              onChange={(event) => setCategoria(event.target.value)}
              value={categoria}
            >
              {categories.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <label className="mt-3 flex flex-col gap-1 text-xs font-medium text-zinc-700">
            Observação
            <textarea
              className="min-h-20 resize-y rounded-md border border-zinc-300 px-2 py-2 text-xs outline-none transition focus:border-zinc-900"
              onChange={(event) => setObservacao(event.target.value)}
              placeholder="Descreve o problema nesta resposta..."
              value={observacao}
            />
          </label>

          {error ? (
            <p className="mt-2 text-xs font-medium text-red-600">{error}</p>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="rounded-md bg-zinc-950 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSaving}
              type="submit"
            >
              {isSaving ? "A guardar..." : "Guardar feedback"}
            </button>
            <button
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100"
              disabled={isSaving}
              onClick={() => {
                setIsOpen(false);
                setError(null);
              }}
              type="button"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
