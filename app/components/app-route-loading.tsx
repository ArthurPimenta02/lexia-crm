export function AppRouteLoading() {
  return (
    <section
      aria-busy="true"
      aria-live="polite"
      className="w-full animate-pulse"
    >
      <span className="sr-only">Carregando página...</span>
      <div className="h-3 w-24 rounded-full bg-zinc-200" />
      <div className="mt-4 h-9 w-72 max-w-[78%] rounded-md bg-zinc-200" />
      <div className="mt-3 h-4 w-[34rem] max-w-full rounded-full bg-zinc-200/80" />

      <div className="mt-8 rounded-2xl border border-zinc-200/80 bg-white/80 p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="h-11 rounded-md bg-zinc-100" />
          <div className="h-11 rounded-md bg-zinc-100" />
          <div className="h-11 rounded-md bg-zinc-200" />
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            className="h-36 rounded-2xl border border-zinc-200/80 bg-white/80 shadow-sm"
            key={index}
          />
        ))}
      </div>
    </section>
  );
}
