import "server-only";

import { decifrar } from "@/lib/conexoes/cifra";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * O painel a falar direto com o Google Agenda (25/11/2026).
 *
 * Até aqui o "Agendar atendimento" mandava a marcação a um workflow do n8n
 * ("PAINEL MARCA NA AGENDA", Rqt1PX2l4qmdWplB), porque era o n8n que tinha a
 * credencial do Google. Já não é preciso: a "Conta Google da Lexia"
 * (`lexia_conexoes`, tipo `google_conta`, global) é a mesma conta que a
 * sincronização da VPS usa, e medido a 25/11 tem escrita nas agendas do Martim
 * e do Samuel e é dona da agenda da Claudia.
 *
 * O Google não manda e-mail nenhum: o evento não leva convidados e o
 * `sendUpdates=none` vai explícito.
 */

const API = "https://www.googleapis.com/calendar/v3";

/**
 * A agenda do Google de cada profissional, por cliente.
 *
 * É a mesma lista que a sincronização da VPS espelha
 * (`lexia-agente/plataforma/agenda/agendas.ts`), conferida contra o
 * `calendarList` da conta a 25/11. O Roberto não está: a agenda dele deixou de
 * estar partilhada com a conta da Lexia, e marcar-lhe aqui escrevia numa agenda
 * que ninguém lê. Samuel e Bruna partilham a agenda da clínica, como no
 * espelho. A Claudia passou a ter uma agenda só (claudialeitespa@gmail.com) a
 * 25/11; as quatro antigas por profissional foram apagadas por ela.
 */
const AGENDAS: Record<string, Record<string, string> | undefined> = {
  claudia_leite_spa: {
    Claudia: "claudialeitespa@gmail.com",
    Jessica: "claudialeitespa@gmail.com",
    Priscilla: "claudialeitespa@gmail.com",
    Suellen: "claudialeitespa@gmail.com",
  },
  detail_by_cordeiro: {
    martim: "detailbycordeiro@gmail.com",
  },
  miranda_skin_experts: {
    Bruna: "smouramiranda@gmail.com",
    Samuel: "smouramiranda@gmail.com",
  },
};

/** Todas as agendas do Google de um cliente, por profissional. */
export function agendasDe(clienteSlug: string): Record<string, string> {
  return { ...(AGENDAS[clienteSlug] ?? {}) };
}

/** A agenda do Google onde se marca para este profissional, ou `null`. */
export function agendaDe(clienteSlug: string, executorChave: string) {
  return AGENDAS[clienteSlug]?.[executorChave] ?? null;
}

let tokenGuardado: { expira: number; valor: string } | null = null;

/** Esquece o acesso guardado. Só os testes precisam. */
export function esquecerAcesso() {
  tokenGuardado = null;
}

/**
 * Um acesso de uma hora à conta Google da Lexia, guardado enquanto vale.
 *
 * Os campos públicos (`client_id`, `email`) estão em `campos` e os secretos
 * cifrados em `segredos`; o pedido ao Google precisa dos dois juntos.
 */
async function acesso(): Promise<string> {
  if (tokenGuardado && tokenGuardado.expira > Date.now() + 60_000) {
    return tokenGuardado.valor;
  }

  const { data, error } = await createAdminClient()
    .from("lexia_conexoes")
    .select("campos, segredos")
    .is("cliente_slug", null)
    .eq("tipo", "google_conta")
    .maybeSingle();

  const linha = data as {
    campos: Record<string, string> | null;
    segredos: string | null;
  } | null;

  if (error || !linha?.segredos) {
    throw new ErroDoGoogle("A conta Google da Lexia não está ligada.");
  }

  const dados = { ...(linha.campos ?? {}), ...decifrar(linha.segredos) };
  const resposta = await fetch("https://oauth2.googleapis.com/token", {
    body: new URLSearchParams({
      client_id: dados.client_id ?? "",
      client_secret: dados.client_secret ?? "",
      grant_type: "refresh_token",
      refresh_token: dados.refresh_token ?? "",
    }),
    method: "POST",
    signal: AbortSignal.timeout(15_000),
  });
  const corpo = (await resposta.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
  };

  if (!resposta.ok || !corpo.access_token) {
    throw new ErroDoGoogle("O Google recusou o acesso à conta da Lexia.");
  }

  tokenGuardado = {
    expira: Date.now() + (corpo.expires_in ?? 3600) * 1000,
    valor: corpo.access_token,
  };

  return corpo.access_token;
}

export class ErroDoGoogle extends Error {}

async function pedir<T>(caminho: string, init: RequestInit = {}): Promise<T> {
  const token = await acesso();
  const resposta = await fetch(`${API}${caminho}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!resposta.ok) {
    console.error(
      "[agenda] o Google respondeu",
      resposta.status,
      await resposta.text().catch(() => ""),
    );
    throw new ErroDoGoogle(`O Google respondeu ${resposta.status}.`);
  }

  return (await resposta.json()) as T;
}

type EventoGoogle = {
  end?: { date?: string; dateTime?: string };
  htmlLink?: string;
  id?: string;
  start?: { date?: string; dateTime?: string };
  status?: string;
  summary?: string;
  transparency?: string;
};

/**
 * Os eventos que ocupam a agenda entre duas horas.
 *
 * Fica de fora o que não ocupa: cancelado, marcado "disponível" no Google, e o
 * de dia inteiro sem hora — na agenda da Miranda são aniversários e "Kids
 * with Andy", que não impedem uma consulta. Um carro de vários dias com hora
 * conta, e é precisamente o caso que tem de dar choque.
 */
export async function ocupadoEntre(
  calendarioId: string,
  inicioIso: string,
  fimIso: string,
) {
  const params = new URLSearchParams({
    maxResults: "50",
    singleEvents: "true",
    timeMax: fimIso,
    timeMin: inicioIso,
  });
  const lista = await pedir<{ items?: EventoGoogle[] }>(
    `/calendars/${encodeURIComponent(calendarioId)}/events?${params}`,
  );

  return (lista.items ?? [])
    .filter(
      (evento) =>
        evento.status !== "cancelled" &&
        evento.transparency !== "transparent" &&
        Boolean(evento.start?.dateTime),
    )
    .map((evento) => ({
      fim: evento.end?.dateTime ?? null,
      inicio: evento.start?.dateTime ?? null,
      titulo: evento.summary ?? null,
    }));
}

/** Cria o evento e devolve o id e o link do Google. */
export async function criarEvento(
  calendarioId: string,
  evento: {
    descricao: string;
    fimIso: string;
    inicioIso: string;
    titulo: string;
    fuso: string;
  },
) {
  const criado = await pedir<EventoGoogle>(
    `/calendars/${encodeURIComponent(calendarioId)}/events?sendUpdates=none`,
    {
      body: JSON.stringify({
        description: evento.descricao,
        end: { dateTime: evento.fimIso, timeZone: evento.fuso },
        start: { dateTime: evento.inicioIso, timeZone: evento.fuso },
        summary: evento.titulo,
      }),
      method: "POST",
    },
  );

  if (!criado.id) {
    throw new ErroDoGoogle("O Google não devolveu o evento criado.");
  }

  return { eventId: criado.id, link: criado.htmlLink ?? null };
}

/** Apaga um evento (sem avisar ninguém). */
export async function apagarEvento(calendarioId: string, eventId: string) {
  const token = await acesso();
  const resposta = await fetch(
    `${API}/calendars/${encodeURIComponent(calendarioId)}/events/${encodeURIComponent(eventId)}?sendUpdates=none`,
    {
      headers: { authorization: `Bearer ${token}` },
      method: "DELETE",
      signal: AbortSignal.timeout(15_000),
    },
  );

  if (!resposta.ok && resposta.status !== 410) {
    throw new ErroDoGoogle(`O Google respondeu ${resposta.status}.`);
  }
}
