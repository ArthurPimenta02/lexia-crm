"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import { IcFechar } from "../_c/icones";
import { agendarMovel, livresAgendar } from "./acoes";

type Executor = { chave: string; duracaoMinutos: number; nome: string };
type Servico = { executores: Executor[]; id: string; nome: string; preco: number | null; precoTexto: string | null };
type Contacto = { id: string; nome: string; telefone: string };
type Textos = Record<
  | "cancelar" | "cliente" | "clienteNovo" | "confirmarWhats" | "confirmarWhatsDica" | "idioma" | "clienteNovoTexto" | "confirmar" | "de" | "deOpcional" | "deOutro" | "dia" | "duracao" | "escolher" | "fechar"
  | "horario" | "jaCliente" | "jaMarcados" | "maisHorarios" | "marcar" | "marcarAs" | "naoLigado" | "nenhumLivre" | "nomeDoCliente" | "novo" | "observacao" | "ocupado"
  | "origens" | "outroDia" | "outroHorario" | "profissional" | "servico" | "telefone" | "valor",
  string
>;

const semAcentos = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const digitos = (s: string) => s.replace(/\D/g, "");

/** 0,5 h … 10 h, de meia em meia hora. A duração fala sempre em horas (pedido do Arthur, 25/11). */
const DURACOES = Array.from({ length: 20 }, (_, i) => (i + 1) * 30);
const emHoras = (min: number, locale: string) => `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(min / 60)} h`;
const meiaHora = (min: number) => Math.max(30, Math.round(min / 30) * 30);

/** O mesmo número escrito com ou sem indicativo: compara-se pelos últimos 9 dígitos. */
function mesmoNumero(a: string, b: string) {
  const x = digitos(a);
  const y = digitos(b);
  if (x.length < 8 || y.length < 8) return false;
  return x.slice(-9) === y.slice(-9);
}

export function FormAgendar(props: {
  confirma: boolean;
  contactoInicial: string | null;
  contactos: Contacto[];
  dia: string;
  diaFixo: string | null;
  dias: { chave: string; rotulo: string }[];
  hoje: string;
  idiomas: ("pt" | "en" | "es")[];
  indicativo: string;
  jaMarcados: { hora: string; nome: string; servico: string }[];
  ligado: boolean;
  locale: string;
  moeda: string;
  servicos: Servico[];
  textos: Textos;
  volta: string;
}) {
  const { textos: t, locale } = props;
  const router = useRouter();
  const origens = useMemo(() => JSON.parse(t.origens) as [string, string][], [t.origens]);

  const [contacto, setContacto] = useState<Contacto | null>(() => props.contactos.find((c) => c.id === props.contactoInicial) ?? null);
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [focoNome, setFocoNome] = useState(false);
  const [servicoId, setServicoId] = useState("");
  const servico = props.servicos.find((s) => s.id === servicoId) ?? null;
  const [executorChave, setExecutorChave] = useState("");
  const executor = servico?.executores.find((e) => e.chave === executorChave) ?? servico?.executores[0] ?? null;
  const [dia, setDia] = useState(props.dia);
  const [outroDia, setOutroDia] = useState(false);
  const [duracao, setDuracao] = useState(60);
  const [hora, setHora] = useState("");
  const [outroHorario, setOutroHorario] = useState(false);
  const [todosHorarios, setTodosHorarios] = useState(false);
  const [livresDe, setLivresDe] = useState<{ lista: string[]; pergunta: string } | null>(null);
  const [valor, setValor] = useState("");
  const [observacao, setObservacao] = useState("");
  const [origem, setOrigem] = useState("");
  const [origemNota, setOrigemNota] = useState("");
  const [confirmar, setConfirmar] = useState(props.confirma);
  const [idioma, setIdioma] = useState<"pt" | "en" | "es">(props.idiomas[0] ?? "pt");
  const [erro, setErro] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [conflitos, setConflitos] = useState<string[]>([]);
  const [feito, setFeito] = useState<string | null>(null);
  const [pendente, inicia] = useTransition();

  // Sugestões pelo nome (fichas que já existem).
  const sugestoes = useMemo(() => {
    // Pelo começo das palavras ("Ana" acha "Ana Souza" e "Maria Ana", não "Orellana").
    const q = semAcentos(nome.trim());
    if (contacto || q.length < 2) return [];
    const partes = q.split(/\s+/);
    return props.contactos
      .filter((c) => {
        const palavras = semAcentos(c.nome).split(/[\s._-]+/);
        return partes.every((p) => palavras.some((w) => w.startsWith(p)));
      })
      .slice(0, 5);
  }, [nome, contacto, props.contactos]);

  // O número escrito já é de alguém?
  const donoDoNumero = useMemo(() => (contacto || digitos(telefone).length < 8 ? null : props.contactos.find((c) => mesmoNumero(c.telefone, telefone)) ?? null), [telefone, contacto, props.contactos]);
  const numeroNovo = !contacto && !donoDoNumero && digitos(telefone).length >= 8;

  const escolherServico = (id: string) => {
    setServicoId(id);
    const s = props.servicos.find((x) => x.id === id);
    const ex = s?.executores[0];
    setExecutorChave(ex?.chave ?? "");
    if (ex?.duracaoMinutos) setDuracao(meiaHora(ex.duracaoMinutos));
    setValor(s?.preco != null ? String(s.preco) : "");
    setHora("");
  };

  // Horários livres: sempre que muda o dia, o profissional ou a duração. A
  // resposta guarda a pergunta a que responde; uma resposta velha não conta.
  const pergunta = executor ? `${dia}|${executor.chave}|${duracao}` : "";
  useEffect(() => {
    if (!pergunta) return;
    const [d, ex, min] = pergunta.split("|");
    let vivo = true;
    livresAgendar(d, ex, Number(min))
      .then((lista) => { if (vivo) setLivresDe({ lista, pergunta }); })
      .catch(() => { if (vivo) setLivresDe({ lista: [], pergunta }); });
    return () => { vivo = false; };
  }, [pergunta]);
  const livres = livresDe && livresDe.pergunta === pergunta ? livresDe.lista : null;

  const rotuloDoDia = (props.diaFixo ? null : props.dias.find((d) => d.chave === dia)?.rotulo.toLowerCase()) ?? new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${dia}T12:00:00Z`)).replace(/\./g, "");

  const enviar = () => {
    if (!servico || !executor || !hora) { setErro(`${t.servico} · ${t.horario}`); return; }
    const f = new FormData();
    if (contacto) f.set("contacto_id", contacto.id);
    else if (donoDoNumero) f.set("contacto_id", donoDoNumero.id);
    else {
      f.set("nome", nome);
      f.set("telefone", telefone);
      f.set("origem", origem);
      f.set("origem_nota", origemNota);
    }
    f.set("servico_id", servico.id);
    f.set("servico_nome", servico.nome);
    f.set("executor", executor.chave);
    f.set("duracao", String(duracao));
    f.set("data", dia);
    f.set("hora", hora);
    f.set("valor", valor);
    f.set("observacao", observacao);
    f.set("idioma", idioma);
    if (confirmar) f.set("confirmar", "sim");
    if (avisos.length || conflitos.length) f.set("confirmado", "sim");
    if (conflitos.length) f.set("ignorar_conflito", "sim");
    setErro(null);
    inicia(async () => {
      const r = await agendarMovel(f);
      if (r.ok) {
        // Marcado; se a confirmação não saiu, o aviso vai na mesma mensagem (a marcação não se desfaz).
        setFeito([r.texto ?? t.marcar, ...r.avisos].join(" "));
        window.setTimeout(() => { router.push(props.volta); router.refresh(); }, r.avisos.length ? 3500 : 1600);
        return;
      }
      setAvisos(r.avisos);
      setConflitos(r.conflitos);
      setErro(r.erro);
    });
  };

  const limparConfirmacao = () => { setAvisos([]); setConflitos([]); };

  if (!props.ligado) {
    return (
      <main className="m-pagina sem-abas ag">
        <header className="ag-cab"><Link aria-label={t.fechar} className="ag-x" href={props.volta}><IcFechar tamanho={18} /></Link><b>{t.novo}</b><span /></header>
        <div className="m-vazio" style={{ marginTop: 40 }}>{t.naoLigado}</div>
      </main>
    );
  }

  return (
    <main className="m-pagina sem-abas ag">
      <header className="ag-cab">
        <Link aria-label={t.fechar} className="ag-x" href={props.volta}><IcFechar tamanho={18} /></Link>
        {props.diaFixo ? <div className="ag-titulo"><small>{t.novo}</small><b>{props.diaFixo}</b></div> : <b>{t.novo}</b>}
        <span />
      </header>

      {props.diaFixo && props.jaMarcados.length ? (
        <section aria-label={t.jaMarcados} className="ag-ja">
          {props.jaMarcados.map((m, i) => <div key={i}><b>{m.hora}</b><span>{[m.nome, m.servico].filter(Boolean).join(" · ")}</span></div>)}
        </section>
      ) : null}

      <div className="ag-campo ag-cliente">
        <label className="ag-rot" htmlFor="ag-nome">{t.cliente}</label>
        {contacto ? (
          <div className="ag-escolhido">
            <span className="av">{contacto.nome.slice(0, 2).toUpperCase()}</span>
            <span className="tx"><b>{contacto.nome}</b><small>{contacto.telefone}</small></span>
            <button aria-label={t.cancelar} onClick={() => { setContacto(null); limparConfirmacao(); }} type="button"><IcFechar tamanho={16} /></button>
          </div>
        ) : (
          <>
            <input autoComplete="off" className="ag-inp" id="ag-nome" onBlur={() => window.setTimeout(() => setFocoNome(false), 150)} onChange={(e) => setNome(e.target.value)} onFocus={() => setFocoNome(true)} placeholder={t.nomeDoCliente} value={nome} />
            {focoNome && sugestoes.length ? (
              <div className="ag-sug" role="listbox">
                {sugestoes.map((c) => (
                  <button key={c.id} onMouseDown={(e) => e.preventDefault()} onClick={() => { setContacto(c); setFocoNome(false); limparConfirmacao(); }} role="option" aria-selected="false" type="button">
                    <span className="av">{c.nome.slice(0, 2).toUpperCase()}</span>
                    <span className="tx"><b>{c.nome}</b><small>{c.telefone}</small></span>
                  </button>
                ))}
              </div>
            ) : null}
          </>
        )}
      </div>

      {!contacto ? (
        <div className="ag-campo">
          <label className="ag-rot" htmlFor="ag-tel">{t.telefone}</label>
          <input autoComplete="tel" className="ag-inp" id="ag-tel" inputMode="tel" onChange={(e) => setTelefone(e.target.value)} placeholder={props.indicativo ? `+${props.indicativo} …` : "+…"} type="tel" value={telefone} />
          {donoDoNumero ? (
            <button className="ag-faixa" onClick={() => { setContacto(donoDoNumero); limparConfirmacao(); }} type="button"><span><b>{t.jaCliente}</b> {donoDoNumero.nome}</span></button>
          ) : numeroNovo && nome.trim() ? (
            <div className="ag-faixa"><span><b>{t.clienteNovo}</b> {t.clienteNovoTexto}</span></div>
          ) : null}
        </div>
      ) : null}

      <div className="ag-campo">
        <label className="ag-rot" htmlFor="ag-serv">{t.servico}</label>
        <select className="ag-inp" id="ag-serv" onChange={(e) => escolherServico(e.target.value)} value={servicoId}>
          <option disabled value="">{t.escolher}</option>
          {props.servicos.map((s) => <option key={s.id} value={s.id}>{s.nome}{s.precoTexto ? ` · ${s.precoTexto}` : ""}</option>)}
        </select>
      </div>

      {servico && servico.executores.length > 1 ? (
        <div className="ag-campo">
          <span className="ag-rot">{t.profissional}</span>
          <div className="ag-pilulas">
            {servico.executores.map((e) => <button className={executor?.chave === e.chave ? "on" : ""} key={e.chave} onClick={() => { setExecutorChave(e.chave); setDuracao(meiaHora(e.duracaoMinutos)); setHora(""); }} type="button">{e.nome}</button>)}
          </div>
        </div>
      ) : null}

      {!props.diaFixo ? (
        <div className="ag-campo">
          <span className="ag-rot">{t.dia}</span>
          <div className="ag-pilulas">
            {props.dias.map((d) => <button className={!outroDia && dia === d.chave ? "on" : ""} key={d.chave} onClick={() => { setOutroDia(false); setDia(d.chave); setHora(""); }} type="button">{d.rotulo}</button>)}
            <button className={outroDia ? "on" : ""} onClick={() => setOutroDia(true)} type="button">{t.outroDia}</button>
          </div>
          {outroDia ? <input aria-label={t.outroDia} className="ag-inp" min={props.hoje} onChange={(e) => { if (e.target.value) { setDia(e.target.value); setHora(""); } }} style={{ marginTop: 8 }} type="date" value={dia} /> : null}
        </div>
      ) : null}

      <div className="ag-campo ag-dois">
        <div>
          <label className="ag-rot" htmlFor="ag-dur">{t.duracao}</label>
          <select className="ag-inp" id="ag-dur" onChange={(e) => { setDuracao(Number(e.target.value)); setHora(""); }} value={duracao}>
            {DURACOES.map((m) => <option key={m} value={m}>{emHoras(m, locale)}</option>)}
          </select>
        </div>
        <div>
          <label className="ag-rot" htmlFor="ag-valor">{t.valor}</label>
          <input className="ag-inp" id="ag-valor" inputMode="decimal" onChange={(e) => setValor(e.target.value)} placeholder={props.moeda} value={valor} />
        </div>
      </div>

      {servico ? (
        <div className="ag-campo">
          <span className="ag-rot">{t.horario}</span>
          {livres === null ? <div className="ag-pilulas ag-carregando"><span /><span /><span /><span /></div> : (
            <div className="ag-horas">
              {livres.length === 0 && !outroHorario ? <p className="ag-nada">{t.nenhumLivre}</p> : null}
              {!outroHorario && (todosHorarios ? livres : livres.slice(0, 8)).map((h) => <button className={hora === h ? "on" : ""} key={h} onClick={() => { setHora(h); limparConfirmacao(); }} type="button">{h}</button>)}
              {!outroHorario && !todosHorarios && livres.length > 8 ? <button className="ag-outro" onClick={() => setTodosHorarios(true)} type="button">{t.maisHorarios}</button> : null}
              <button className={`ag-outro${outroHorario ? " on" : ""}`} onClick={() => { setOutroHorario(!outroHorario); setHora(""); }} type="button">{t.outroHorario}</button>
            </div>
          )}
          {outroHorario ? <input aria-label={t.outroHorario} className="ag-inp" onChange={(e) => { setHora(e.target.value); limparConfirmacao(); }} step={900} style={{ marginTop: 8 }} type="time" value={hora} /> : null}
        </div>
      ) : null}

      <div className="ag-campo">
        <label className="ag-rot" htmlFor="ag-obs">{t.observacao}</label>
        <input className="ag-inp" id="ag-obs" maxLength={400} onChange={(e) => setObservacao(e.target.value)} value={observacao} />
      </div>

      {!contacto && !donoDoNumero ? (
        <div className="ag-campo">
          <span className="ag-rot">{t.de} <i>{t.deOpcional}</i></span>
          <div className="ag-pilulas">
            {origens.map(([v, r]) => <button className={origem === v ? "on" : ""} key={v} onClick={() => setOrigem(origem === v ? "" : v)} type="button">{r}</button>)}
          </div>
          {origem === "outro" ? <input aria-label={t.deOutro} className="ag-inp" maxLength={200} onChange={(e) => setOrigemNota(e.target.value)} placeholder={t.deOutro} style={{ marginTop: 8 }} value={origemNota} /> : null}
        </div>
      ) : null}

      {props.confirma ? (
        <div className="ag-campo">
          <label className="ag-interruptor">
            <span><span style={{ display: "block" }}>{t.confirmarWhats}</span><small style={{ color: "var(--m-texto2)", fontSize: 13, fontWeight: 400 }}>{t.confirmarWhatsDica}</small></span>
            <input checked={confirmar} onChange={(e) => setConfirmar(e.target.checked)} role="switch" type="checkbox" />
          </label>
          {confirmar && props.idiomas.length > 1 ? (
            <div className="ag-pilulas" style={{ marginTop: 8 }} aria-label={t.idioma} role="group">
              {props.idiomas.map((i) => <button className={idioma === i ? "on" : ""} key={i} onClick={() => setIdioma(i)} type="button">{i === "pt" ? "Português" : i === "en" ? "English" : "Español"}</button>)}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Avisos e erros ficam colados ao botão: lá em cima do formulário ninguém os via. */}
      <div className="ag-rodape">
        {avisos.length || conflitos.length ? (
          <div className="ag-alerta" role="alert">
            {conflitos.length ? <b>{t.ocupado}</b> : null}
            {[...conflitos, ...avisos].map((a) => <span key={a}>{a}</span>)}
          </div>
        ) : null}
        {erro ? <p className="ag-erro" role="alert">{erro}</p> : null}
        <button className="m-botao verde" disabled={pendente || !servico || !hora || (!contacto && !donoDoNumero && (!nome.trim() || digitos(telefone).length < 8))} onClick={enviar} type="button">
          {avisos.length || conflitos.length ? t.confirmar : hora ? t.marcarAs.replace("{dia}", rotuloDoDia).replace("{hora}", hora) : t.marcar}
        </button>
      </div>

      {feito ? <div className="m-toast" role="status">{feito}</div> : null}
    </main>
  );
}
