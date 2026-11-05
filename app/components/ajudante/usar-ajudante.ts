"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A conversa com o Analista Lexia, partilhada pelo painel do computador e
 * pelo app do iPhone (cada um desenha à sua maneira). Fala com /api/ajudante
 * e, para confirmar uma mensagem proposta, com /api/m/enviar.
 */
export type Proposta = { tipo: "mensagem"; conversa: string; nome: string; texto: string };
export type MensagemAjudante = {
  id: string;
  papel: "usuario" | "assistente";
  conteudo: string;
  propostas: (Proposta & { estado?: "enviando" | "enviada" | "erro" })[];
  erro?: boolean;
};
export type SessaoAjudante = { id: string; titulo: string | null; atualizado_em: string };

export function useAjudante({ cliente, tela, textos }: { cliente?: string; tela?: string; textos: { erro: string; desligado: string } }) {
  const [mensagens, setMensagens] = useState<MensagemAjudante[]>([]);
  const [sessao, setSessao] = useState<string | null>(null);
  const [sessoes, setSessoes] = useState<SessaoAjudante[]>([]);
  const [ligado, setLigado] = useState<boolean | null>(null);
  const [aPensar, setAPensar] = useState<string | null>(null);
  const sessaoRef = useRef<string | null>(null);
  sessaoRef.current = sessao;
  const q = cliente ? `cliente=${encodeURIComponent(cliente)}` : "";

  const carregarLista = useCallback(async () => {
    try {
      const r = await fetch(`/api/ajudante?${q}`, { cache: "no-store" });
      if (!r.ok) return;
      const d = (await r.json()) as { ligado: boolean; sessoes: SessaoAjudante[] };
      setLigado(d.ligado);
      setSessoes(d.sessoes);
    } catch {
      // sem rede: fica como está
    }
  }, [q]);

  useEffect(() => {
    void fetch(`/api/ajudante?${q}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ ligado: boolean; sessoes: SessaoAjudante[] }>) : null))
      .then((d) => {
        if (!d) return;
        setLigado(d.ligado);
        setSessoes(d.sessoes);
      })
      .catch(() => undefined);
  }, [q]);

  const abrir = useCallback(async (id: string) => {
    const r = await fetch(`/api/ajudante?${q}&sessao=${encodeURIComponent(id)}`, { cache: "no-store" });
    if (!r.ok) return;
    const d = (await r.json()) as { mensagens: MensagemAjudante[] };
    setSessao(id);
    setMensagens(d.mensagens.map((m) => ({ ...m, propostas: m.propostas ?? [] })));
  }, [q]);

  const nova = useCallback(() => {
    setSessao(null);
    setMensagens([]);
  }, []);

  const perguntar = useCallback(async (pergunta: string) => {
    const texto = pergunta.trim();
    if (!texto || aPensar) return;
    const idU = crypto.randomUUID();
    setMensagens((ms) => [...ms, { conteudo: texto, id: idU, papel: "usuario", propostas: [] }]);
    setAPensar("…");
    const falhar = (msg: string) => setMensagens((ms) => [...ms, { conteudo: msg, erro: true, id: crypto.randomUUID(), papel: "assistente", propostas: [] }]);
    try {
      const r = await fetch("/api/ajudante", { body: JSON.stringify({ cliente, pergunta: texto, sessao: sessaoRef.current, tela }), headers: { "content-type": "application/json" }, method: "POST" });
      if (!r.ok || !r.body) {
        const d = (await r.json().catch(() => ({}))) as { erro?: string };
        falhar(r.status === 503 ? textos.desligado : d.erro || textos.erro);
        return;
      }
      const leitor = r.body.getReader();
      const dec = new TextDecoder();
      let resto = "";
      for (;;) {
        const { done, value } = await leitor.read();
        if (done) break;
        resto += dec.decode(value, { stream: true });
        const linhas = resto.split("\n");
        resto = linhas.pop() ?? "";
        for (const l of linhas) {
          if (!l.trim()) continue;
          const ev = JSON.parse(l) as { tipo: string; sessao?: string; rotulo?: string; texto?: string; propostas?: Proposta[]; erro?: string };
          if (ev.tipo === "sessao" && ev.sessao) setSessao(ev.sessao);
          else if (ev.tipo === "ferramenta") setAPensar(ev.rotulo ?? "…");
          else if (ev.tipo === "resposta") setMensagens((ms) => [...ms, { conteudo: ev.texto ?? "", id: crypto.randomUUID(), papel: "assistente", propostas: ev.propostas ?? [] }]);
          else if (ev.tipo === "erro") falhar(ev.erro || textos.erro);
        }
      }
      void carregarLista();
    } catch {
      falhar(textos.erro);
    } finally {
      setAPensar(null);
    }
  }, [aPensar, carregarLista, cliente, tela, textos.desligado, textos.erro]);

  /** O dono confirmou: envia a mensagem proposta pelo canal real. */
  const confirmar = useCallback(async (idMensagem: string, indice: number) => {
    const marcar = (estado: "enviando" | "enviada" | "erro") =>
      setMensagens((ms) => ms.map((m) => (m.id === idMensagem ? { ...m, propostas: m.propostas.map((p, i) => (i === indice ? { ...p, estado } : p)) } : m)));
    const p = mensagens.find((m) => m.id === idMensagem)?.propostas[indice];
    if (!p || p.estado === "enviando" || p.estado === "enviada") return;
    marcar("enviando");
    try {
      const r = await fetch("/api/m/enviar", { body: JSON.stringify({ cliente, conversa: p.conversa, texto: p.texto }), headers: { "content-type": "application/json" }, method: "POST" });
      marcar(r.ok ? "enviada" : "erro");
    } catch {
      marcar("erro");
    }
  }, [cliente, mensagens]);

  return { aPensar, abrir, confirmar, ligado, mensagens, nova, perguntar, sessao, sessoes };
}

/** Markdown mínimo da resposta (parágrafos, listas com "-", **negrito**), sem HTML cru. */
export function blocosDe(texto: string) {
  const blocos: { tipo: "p" | "lista"; linhas: string[] }[] = [];
  for (const linha of texto.split("\n")) {
    const l = linha.trim();
    if (!l) { blocos.push({ linhas: [], tipo: "p" }); continue; }
    const item = /^[-•*]\s+/.test(l) || /^\d+[.)]\s+/.test(l);
    const ultimo = blocos[blocos.length - 1];
    if (item) {
      const t = l.replace(/^([-•*]|\d+[.)])\s+/, "");
      if (ultimo?.tipo === "lista") ultimo.linhas.push(t);
      else blocos.push({ linhas: [t], tipo: "lista" });
    } else if (ultimo?.tipo === "p" && ultimo.linhas.length) ultimo.linhas.push(l);
    else blocos.push({ linhas: [l.replace(/^#+\s*/, "")], tipo: "p" });
  }
  return blocos.filter((b) => b.linhas.length);
}

/** Partes de uma linha: texto normal e **negrito**. */
export function partesDe(linha: string) {
  return linha.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((p) => (p.startsWith("**") && p.endsWith("**") ? { negrito: true, t: p.slice(2, -2) } : { negrito: false, t: p }));
}
