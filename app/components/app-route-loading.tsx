import { Tr } from "@/app/components/idioma";

/**
 * O que se vê enquanto a página seguinte carrega.
 *
 * Imita a forma das páginas novas (sobretítulo, título grande, cartões
 * soltos e um bloco grande) para que, quando o conteúdo chega, nada salte
 * de sítio.
 */
export function AppRouteLoading() {
  return (
    <section aria-busy="true" aria-live="polite" className="flex w-full flex-col gap-6 animate-pulse">
      <span className="sr-only"><Tr>Carregando página...</Tr></span>

      <div>
        <div className="h-3 w-40 rounded-full bg-border" />
        <div className="mt-3 h-9 w-[28rem] max-w-[85%] rounded-xl bg-border" />
        <div className="mt-3 h-3.5 w-48 rounded-full bg-muted" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="ds-bloco h-[7.5rem]" key={index} />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.65fr_1fr]">
        <div className="ds-bloco h-72" />
        <div className="ds-bloco h-72" />
      </div>
    </section>
  );
}
