"use client";

import { Bell, CalendarClock, Hand, MessageSquare } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import type { Aviso, AvisosResultado, TipoDeAviso } from "@/lib/avisos/read";

/**
 * O sino.
 *
 * Porque é que os dados vêm de um hook e não de dentro do componente
 * -----------------------------------------------------------------
 * O sino aparece em dois sítios do ecrã: na barra de cima do telemóvel e no
 * topo da barra lateral do computador. Só um deles está visível de cada vez,
 * mas os DOIS estão montados — é CSS que esconde um. Se cada um lesse os seus
 * avisos, cada página do produto fazia duas leituras iguais à base. O hook
 * corre uma vez na moldura e o estado desce para os dois.
 *
 * Porque é que o número desaparece ao abrir
 * ----------------------------------------
 * Abrir a lista é ver os avisos. Marcar como lido ao abrir é o que faz o sino
 * voltar a zero e, por isso, o que o mantém útil: um sino que está sempre
 * vermelho é um sino que ninguém lê. Os avisos continuam todos na lista — o
 * que se apaga é o realce, não a informação.
 *
 * E se a situação mudar, o aviso volta: a chave de cada aviso carrega o
 * instante do facto, por isso uma mensagem nova é uma chave nova e acende o
 * sino outra vez (ver `supabase/migrations/202610190009_fase15_avisos_lidos`).
 */

const ICONE: Record<TipoDeAviso, typeof Bell> = {
  handoff: Hand,
  marcacao: CalendarClock,
  por_responder: MessageSquare,
};

const vazio: AvisosResultado = { avisos: [], erro: null, naoLidos: 0 };

export type EstadoDosAvisos = AvisosResultado & {
  aCarregar: boolean;
  /** Chamado quando a lista é aberta. Marca tudo o que lá está como visto. */
  marcarTodos: () => void;
};

/**
 * @param activo Falso no painel de administração, que não tem avisos: a
 *   leitura só serve a um `cliente_slug`, e um sino que abre sempre vazio é
 *   um botão a mentir. Fica o pedido por fazer em vez de dar 401.
 */
export function useAvisos(activo: boolean): EstadoDosAvisos {
  const [resultado, setResultado] = useState<AvisosResultado>(vazio);
  // Começa a carregar só se houver leitura para fazer. Pôr `true` aqui e
  // desligá-lo no efeito dava um render a mais por nada.
  const [aCarregar, setACarregar] = useState(activo);

  useEffect(() => {
    if (!activo) {
      return;
    }

    const controlador = new AbortController();

    const ler = async () => {
      try {
        const resposta = await fetch("/api/avisos", {
          cache: "no-store",
          signal: controlador.signal,
        });

        if (!resposta.ok) {
          // Sem sessão não há nada a dizer, e um erro vermelho ao lado de um
          // sino não ajuda ninguém: fica o sino apagado.
          setResultado(vazio);

          return;
        }

        setResultado((await resposta.json()) as AvisosResultado);
      } catch {
        if (!controlador.signal.aborted) {
          setResultado(vazio);
        }
      } finally {
        if (!controlador.signal.aborted) {
          setACarregar(false);
        }
      }
    };

    void ler();

    return () => controlador.abort();
  }, [activo]);

  const marcarTodos = useCallback(() => {
    setResultado((anterior) => {
      const porMarcar = anterior.avisos
        .filter((aviso) => !aviso.lido)
        .map((aviso) => aviso.chave);

      if (porMarcar.length === 0) {
        return anterior;
      }

      // Primeiro o ecrã, depois a base. Se a gravação falhar, o pior que
      // acontece é o sino voltar a acender na próxima página — e isso é
      // melhor do que o número ficar à espera de uma ida ao servidor.
      void fetch("/api/avisos", {
        body: JSON.stringify({ chaves: porMarcar }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }).catch(() => undefined);

      return {
        ...anterior,
        avisos: anterior.avisos.map((aviso) => ({ ...aviso, lido: true })),
        naoLidos: 0,
      };
    });
  }, []);

  return { ...resultado, aCarregar, marcarTodos };
}

/** "há 2 dias" já vem escrito do servidor; aqui só se mostra. */
function LinhaDoAviso({ aviso, onIr }: { aviso: Aviso; onIr: () => void }) {
  const Icone = ICONE[aviso.tipo];
  const miolo = (
    <>
      <span
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
          aviso.lido
            ? "bg-muted text-muted-foreground"
            : "bg-primary/10 text-primary"
        }`}
      >
        <Icone aria-hidden="true" className="h-3.5 w-3.5" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">
          {aviso.titulo}
        </span>
        <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
          {aviso.porque}
        </span>
      </span>
    </>
  );

  if (!aviso.href) {
    return (
      <li className="flex gap-3 border-b border-border px-3 py-2.5 last:border-b-0">
        {miolo}
      </li>
    );
  }

  return (
    <li className="border-b border-border last:border-b-0">
      <Link
        className="flex gap-3 px-3 py-2.5 transition hover:bg-muted"
        href={aviso.href}
        onClick={onIr}
      >
        {miolo}
      </Link>
    </li>
  );
}

type SinoAvisosProps = {
  className?: string;
  estado: EstadoDosAvisos;
};

export function SinoAvisos({ className = "", estado }: SinoAvisosProps) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const { aCarregar, avisos, erro, marcarTodos, naoLidos } = estado;

  useEffect(() => {
    if (!aberto) {
      return;
    }

    const aoClicarFora = (evento: MouseEvent) => {
      if (!caixa.current?.contains(evento.target as Node)) {
        setAberto(false);
      }
    };
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") {
        setAberto(false);
      }
    };

    document.addEventListener("mousedown", aoClicarFora);
    document.addEventListener("keydown", aoTeclar);

    return () => {
      document.removeEventListener("mousedown", aoClicarFora);
      document.removeEventListener("keydown", aoTeclar);
    };
  }, [aberto]);

  const abrir = () => {
    const vaiAbrir = !aberto;

    setAberto(vaiAbrir);

    if (vaiAbrir) {
      marcarTodos();
    }
  };

  return (
    <div className={`relative ${className}`} ref={caixa}>
      <button
        aria-expanded={aberto}
        aria-label={
          naoLidos > 0
            ? `Avisos: ${naoLidos} ${naoLidos === 1 ? "novo" : "novos"}`
            : "Avisos"
        }
        className="relative flex h-10 w-10 items-center justify-center rounded-lg text-sidebar-foreground transition hover:bg-muted"
        onClick={abrir}
        type="button"
      >
        <Bell aria-hidden="true" className="h-5 w-5" />
        {naoLidos > 0 ? (
          <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white">
            {naoLidos > 9 ? "9+" : naoLidos}
          </span>
        ) : null}
      </button>

      {aberto ? (
        <div className="absolute right-0 z-50 mt-2 w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-border bg-card shadow-xl">
          <div className="border-b border-border px-3 py-2">
            <p className="text-sm font-semibold text-foreground">Avisos</p>
            <p className="text-xs text-muted-foreground">
              Quem está à espera, as passagens para a equipa e os atendimentos
              das próximas 24 horas.
            </p>
          </div>

          <div className="max-h-[min(24rem,60vh)] overflow-y-auto">
            {erro ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                {erro}
              </p>
            ) : aCarregar ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                A ler...
              </p>
            ) : avisos.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                Nada à espera de ti.
              </p>
            ) : (
              <ul>
                {avisos.map((aviso) => (
                  <LinhaDoAviso
                    aviso={aviso}
                    key={aviso.chave}
                    onIr={() => setAberto(false)}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
