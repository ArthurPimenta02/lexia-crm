/**
 * O que se vê enquanto a página seguinte carrega.
 *
 * Imita a forma da página real — título, barra de filtros, uma faixa de
 * métricas — para que, quando o conteúdo chega, nada salte de sítio. Por isso
 * a faixa é desenhada do mesmo modo que a verdadeira: células separadas pelo
 * fundo a aparecer no `gap-px`, e não quatro cartões soltos.
 */
export function AppRouteLoading() {
  return (
    <section aria-busy="true" aria-live="polite" className="w-full animate-pulse">
      <span className="sr-only">Carregando página...</span>

      <div className="h-8 w-56 max-w-[70%] rounded-lg bg-border" />

      <div className="mt-6 rounded-2xl border border-border bg-surface p-5">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <div className="h-10 rounded-lg bg-muted" />
          <div className="h-10 rounded-lg bg-muted" />
          <div className="h-10 w-28 rounded-lg bg-border" />
        </div>
      </div>

      <div className="mt-6 h-4 w-32 rounded-full bg-border" />

      <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="h-28 bg-surface" key={index} />
        ))}
      </div>
    </section>
  );
}
