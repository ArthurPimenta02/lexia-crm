// Opções de pausa manual. Arquivo sem segredos: pode ser importado por
// Client Components, ao contrário de agent-locks.ts.

export type ManualPauseDuration = "10" | "30" | "60" | "sem_validade";

export const manualPauseDurations: {
  label: string;
  seconds: number | null;
  value: ManualPauseDuration;
}[] = [
  { label: "10 minutos", seconds: 600, value: "10" },
  { label: "30 minutos", seconds: 1800, value: "30" },
  { label: "1 hora", seconds: 3600, value: "60" },
  { label: "Sem validade", seconds: null, value: "sem_validade" },
];
