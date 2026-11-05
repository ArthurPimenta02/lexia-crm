/**
 * Datas, horas e valores do app, sempre no fuso do cliente e no idioma do
 * iPhone (nunca no fuso da máquina da Vercel, que é UTC).
 */

export function partesNoFuso(iso: string | Date, fuso: string) {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { day: "2-digit", hour: "2-digit", hourCycle: "h23", minute: "2-digit", month: "2-digit", timeZone: fuso, weekday: "short", year: "numeric" })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return { ano: +p.year, dia: +p.day, hora: `${p.hour}:${p.minute}`, mes: +p.month, chave: `${p.year}-${p.month}-${p.day}` };
}

export function chaveDoDia(iso: string | Date, fuso: string) {
  return partesNoFuso(iso, fuso).chave;
}

/** Dias inteiros entre duas datas, contados no fuso (hoje = 0, ontem = -1). */
export function diferencaDias(iso: string | Date, agora: Date, fuso: string) {
  const a = partesNoFuso(iso, fuso), b = partesNoFuso(agora, fuso);
  return Math.round((Date.UTC(a.ano, a.mes - 1, a.dia) - Date.UTC(b.ano, b.mes - 1, b.dia)) / 86_400_000);
}

/** "9:12", "Ontem", "qua", "02/11" — como na lista do WhatsApp. */
export function quandoCurto(iso: string, agora: Date, fuso: string, locale: string, ontem: string) {
  const dias = diferencaDias(iso, agora, fuso);
  if (dias === 0) return partesNoFuso(iso, fuso).hora;
  if (dias === -1) return ontem;
  if (dias > -7) return new Intl.DateTimeFormat(locale, { timeZone: fuso, weekday: "short" }).format(new Date(iso)).replace(".", "");
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", timeZone: fuso }).format(new Date(iso));
}

/** "14 min", "1 h", "1 h 20 min", "2 d". */
export function duracaoCurta(desdeIso: string, agora: Date) {
  const min = Math.max(1, Math.round((agora.getTime() - Date.parse(desdeIso)) / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return min % 60 && h < 3 ? `${h} h ${min % 60} min` : `${h} h`;
  return `${Math.floor(h / 24)} d`;
}

export function moeda(valor: number, locale: string, codigo: string) {
  return new Intl.NumberFormat(locale, { currency: codigo, maximumFractionDigits: valor % 1 ? 2 : 0, minimumFractionDigits: valor % 1 ? 2 : 0, style: "currency" }).format(valor);
}

/** A moeda do cliente: a configurada nos serviços; senão pelo fuso (Europa → euro, resto → dólar). */
export function moedaDoCliente(configurada: string | null, fuso: string) {
  return configurada ?? (fuso.startsWith("Europe/") ? "EUR" : "USD");
}

export function iniciais(nome: string) {
  const partes = nome.replace(/[^\p{L}\p{N} ]/gu, " ").trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "?";
  if (/^\d/.test(partes[0])) return "#";
  return (partes[0][0] + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase();
}

/** Uma cor estável por pessoa (para o círculo das iniciais). */
const CORES = ["#ffd8a8", "#f8c8dc", "#c8f0dc", "#c9e7ff", "#e3d7ff", "#ffe6a8", "#d4ecc4", "#ffd0c7"];
export function corDe(chave: string) {
  let h = 0;
  for (const c of chave) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return CORES[h % CORES.length];
}
