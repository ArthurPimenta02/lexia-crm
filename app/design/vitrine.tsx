"use client";

import { useEffect, useState } from "react";

import {
  ArrowRight,
  Bell,
  Bot,
  CalendarDays,
  ChartNoAxesColumn,
  Columns3,
  Inbox,
  LayoutGrid,
  MessageCircle,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
  Users,
} from "lucide-react";

import { InstagramGlyph, WhatsAppGlyph } from "@/app/components/channel-glyphs";
import {
  Avatar,
  Barra,
  Botao,
  CabecalhoCartao,
  Cartao,
  Etapas,
  Interruptor,
  Metrica,
  Segmentado,
  Selo,
  Trilho,
} from "@/app/components/ds";

/* Dados de exemplo — inventados, nada da base. */
const conversas = [
  { nome: "Larissa Moretti", msg: "Tem horário no sábado de manhã?", hora: "09:44", espera: "4 min", canal: "wa" },
  { nome: "Thiago Barros", msg: "Quanto fica o polimento completo?", hora: "08:57", espera: "", canal: "ig" },
  { nome: "Otávio Ribas", msg: "Perfeito, obrigado!", hora: "08:12", espera: "", canal: "wa" },
  { nome: "Natália Busato", msg: "Pode ser às 14h então", hora: "07:58", espera: "29 min", canal: "ig" },
  { nome: "Helena Prates", msg: "Vocês atendem domingo?", hora: "ontem", espera: "", canal: "wa" },
];

const funil = [
  { etapa: "Novo", valor: "$ 1,2 mil", leads: [{ n: "Otávio Ribas", s: "Ainda não decidiu" }, { n: "Rodrigo Teixeira", s: "Pediu orçamento" }] },
  { etapa: "Qualificado", valor: "$ 3,4 mil", leads: [{ n: "Larissa Moretti", s: "Quer sábado" }, { n: "Thiago Barros", s: "Polimento" }] },
  { etapa: "Agendado", valor: "$ 2,1 mil", leads: [{ n: "Renato e Sílvia", s: "Sáb 17 · 10:00" }] },
  { etapa: "Fechado", valor: "$ 4,8 mil", leads: [{ n: "Helena Prates", s: "Pago" }] },
];

const serie = [18, 22, 21, 27, 25, 31, 34, 33, 39, 44, 42, 51];

function GraficoArea() {
  const w = 560;
  const h = 160;
  const max = Math.max(...serie) * 1.1;
  const pts = serie.map((v, i) => [(i / (serie.length - 1)) * w, h - (v / max) * h] as const);
  const meta = serie
    .map((_, i) => [(i / (serie.length - 1)) * w, h - ((20 + i * 2.6) / max) * h] as const)
    .map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  const linha = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <svg className="h-40 w-full" preserveAspectRatio="none" viewBox={`0 0 ${w} ${h}`}>
      <defs>
        <linearGradient id="ds-area" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--ds-acao)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--ds-acao)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((p) => (
        <line key={p} stroke="var(--ds-linha)" strokeDasharray="3 4" x1="0" x2={w} y1={h * p} y2={h * p} />
      ))}
      <path d={`${linha} L${w},${h} L0,${h} Z`} fill="url(#ds-area)" />
      <path d={meta} fill="none" stroke="var(--ds-mancha-2)" strokeDasharray="5 5" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      <path d={linha} fill="none" stroke="var(--ds-acao)" strokeLinejoin="round" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function BarrasCanal() {
  const dados = [
    { r: "Meta Ads", v: 62 },
    { r: "Instagram", v: 24 },
    { r: "WhatsApp", v: 9 },
    { r: "Site", v: 5 },
  ];
  return (
    <div className="flex h-40 items-end gap-4">
      {dados.map((d, i) => (
        <div className="flex flex-1 flex-col items-center gap-2" key={d.r}>
          <span className="ds-numero text-xs">{d.v}%</span>
          <div
            className="w-full rounded-[8px]"
            style={{
              height: `${d.v * 1.6}px`,
              background: i === 0 ? "var(--ds-acao)" : i === 1 ? "var(--ds-mancha-2)" : "var(--ds-acao-suave)",
            }}
          />
          <span className="ds-legenda">{d.r}</span>
        </div>
      ))}
    </div>
  );
}

function BarraLateral() {
  const itens = [
    { i: LayoutGrid, t: "Visão geral", activo: true },
    { i: MessageCircle, t: "Conversas", n: 3 },
    { i: Columns3, t: "Funil" },
    { i: CalendarDays, t: "Agenda" },
    { i: Users, t: "Leads" },
    { i: ChartNoAxesColumn, t: "Campanhas" },
    { i: Bot, t: "Agente" },
    { i: Settings, t: "Configurações" },
  ];
  return (
    <aside className="hidden w-60 shrink-0 flex-col gap-6 border-r border-[var(--ds-linha)] bg-[var(--ds-vidro)] p-4 backdrop-blur-xl lg:flex">
      <div className="flex items-center gap-2.5 px-1.5">
        <span className="grid size-7 place-items-center rounded-[8px] bg-[var(--ds-acao)] text-[0.75rem] font-bold text-[var(--ds-acao-texto)]">L</span>
        <div className="leading-tight">
          <p className="text-[0.8125rem] font-semibold">Lexia</p>
          <p className="ds-legenda">Detail by Cordeiro</p>
        </div>
      </div>
      <nav className="flex flex-col gap-0.5">
        {itens.map(({ i: Icone, t, activo, n }) => (
          <a aria-current={activo ? "page" : undefined} className="ds-nav-item" href="#" key={t}>
            <Icone size={16} strokeWidth={1.75} />
            <span className="flex-1">{t}</span>
            {n ? (
              <span className="grid size-[1.125rem] place-items-center rounded-full bg-[var(--ds-botao)] text-[0.625rem] font-semibold text-[var(--ds-botao-texto)]">
                {n}
              </span>
            ) : null}
          </a>
        ))}
      </nav>
      <div className="mt-auto flex items-center gap-2.5 rounded-[12px] p-1.5">
        <Avatar nome="Martim Cordeiro" />
        <div className="min-w-0 leading-tight">
          <p className="truncate text-[0.8125rem] font-medium">Martim Cordeiro</p>
          <p className="ds-legenda truncate">Dono</p>
        </div>
      </div>
    </aside>
  );
}

function TelaExemplo() {
  const [periodo, setPeriodo] = useState("30d");
  const [vista, setVista] = useState("kanban");
  const [agente, setAgente] = useState(true);

  return (
    <div className="ds-cartao overflow-hidden">
      <div className="flex min-h-[760px]">
        <BarraLateral />
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Barra de topo em vidro */}
          <header className="ds-vidro sticky top-0 z-10 flex items-center gap-3 px-6 py-3">
            <div className="flex h-9 flex-1 items-center gap-2 rounded-[11px] bg-[color-mix(in_oklab,var(--ds-texto)_5%,transparent)] px-3 text-[var(--ds-texto-3)] sm:max-w-xs">
              <Search size={15} />
              <span className="text-[0.8125rem]">Buscar lead, conversa…</span>
              <kbd className="ml-auto rounded-[5px] bg-[var(--ds-superficie)] px-1.5 text-[0.625rem] font-medium shadow-[0_0_0_1px_var(--ds-linha)]">⌘K</kbd>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button aria-label="Avisos" className="ds-botao ds-botao-fantasma relative !h-9 !w-9 !p-0">
                <Bell size={16} />
                <span className="absolute top-2 right-2 size-1.5 rounded-full bg-[var(--ds-perigo)]" />
              </button>
              <Botao tamanho="p">
                <Plus size={14} /> Novo lead
              </Botao>
            </div>
          </header>

          <main className="flex flex-col gap-6 p-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="ds-sobretitulo">Detail by Cordeiro // visão geral</p>
                <h1 className="ds-titulo-1 mt-2">
                  Bom dia, Martim. <span className="ds-destaque">3 clientes</span> esperam você.
                </h1>
              </div>
              <Trilho
                onChange={setPeriodo}
                opcoes={[
                  { label: "Hoje", valor: "hoje" },
                  { label: "7 dias", valor: "7d" },
                  { label: "30 dias", valor: "30d" },
                ]}
                valor={periodo}
              />
            </div>

            {/* Métricas */}
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
              {[
                { r: "Conversas", v: "248", d: "+12% vs. mês anterior", p: true },
                { r: "Agendados", v: "61", d: "+8 nesta semana", p: true },
                { r: "Receita prevista", v: "$ 11,5k", d: "+$ 2,1k", p: true },
                { r: "Tempo de resposta", v: "38 s", d: "−4 s", p: true },
              ].map((m) => (
                <Cartao className="p-5" key={m.r} nivel={1}>
                  <Metrica rotulo={m.r} valor={m.v} variacao={{ positiva: m.p, texto: m.d }} />
                </Cartao>
              ))}
            </div>

            <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
              <Cartao className="p-5" nivel={1}>
                <CabecalhoCartao
                  acao={<Selo tom="neutro">Últimos 12 meses</Selo>}
                  subtitulo="Agendamentos fechados pelo agente"
                  titulo="Vendas"
                />
                <div className="mt-4">
                  <GraficoArea />
                </div>
              </Cartao>
              <Cartao className="p-5" nivel={1}>
                <CabecalhoCartao subtitulo="De onde vem cada lead" titulo="Canal" />
                <div className="mt-4">
                  <BarrasCanal />
                </div>
              </Cartao>
            </div>

            <div className="grid gap-4 xl:grid-cols-[1fr_1.6fr]">
              {/* Conversas */}
              <Cartao className="flex flex-col p-2" nivel={1}>
                <div className="flex items-center justify-between px-3 pt-3 pb-2">
                  <h3 className="ds-titulo-3">
                    Conversas <span className="ml-1 text-[var(--ds-texto-3)]">· 3 não lidas</span>
                  </h3>
                  <button className="ds-botao ds-botao-fantasma ds-botao-p">
                    <SlidersHorizontal size={14} /> Filtrar
                  </button>
                </div>
                <ul className="flex flex-col">
                  {conversas.map((c) => (
                    <li key={c.nome}>
                      <a
                        className="flex items-center gap-3 rounded-[12px] px-3 py-2.5 transition-colors hover:bg-[color-mix(in_oklab,var(--ds-texto)_4%,transparent)]"
                        href="#"
                      >
                        <div className="relative">
                          <Avatar nome={c.nome} tamanho={34} />
                          <span className="absolute -right-0.5 -bottom-0.5 grid size-4 place-items-center rounded-full bg-[var(--ds-superficie)]">
                            {c.canal === "wa" ? (
                              <WhatsAppGlyph className="size-3 text-[#25d366]" />
                            ) : (
                              <InstagramGlyph className="size-3 text-[#e1306c]" />
                            )}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="truncate text-[0.8125rem] font-medium">{c.nome}</p>
                            <span className="ds-legenda shrink-0">{c.hora}</span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-[0.75rem] text-[var(--ds-texto-2)]">{c.msg}</p>
                            {c.espera ? (
                              <span className="shrink-0 text-[0.6875rem] font-medium text-[var(--ds-perigo)]">
                                {c.espera}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </a>
                    </li>
                  ))}
                </ul>
              </Cartao>

              {/* Funil */}
              <Cartao className="p-5" nivel={1}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <h3 className="ds-titulo-3">Funil</h3>
                    <Selo ponto tom="verde">
                      Agente atendendo
                    </Selo>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-[0.8125rem] text-[var(--ds-texto-2)]">
                      Agente ligado
                      <Interruptor ligado={agente} onChange={setAgente} rotulo="Agente ligado" />
                    </label>
                    <Trilho
                      onChange={setVista}
                      opcoes={[
                        { label: "Kanban", valor: "kanban" },
                        { label: "Lista", valor: "lista" },
                      ]}
                      valor={vista}
                    />
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                  {funil.map((col) => (
                    <div className="flex flex-col gap-2 rounded-[14px] bg-[var(--ds-superficie-2)] p-2 shadow-[inset_0_0_0_1px_var(--ds-linha)]" key={col.etapa}>
                      <div className="flex flex-col gap-1 px-1.5 pt-1">
                        <span className="text-[0.75rem] font-semibold">{col.etapa}</span>
                        <span className="ds-numero text-[0.6875rem] whitespace-nowrap text-[var(--ds-texto-3)]">{col.valor}</span>
                      </div>
                      {col.leads.map((l) => (
                        <div className="ds-bloco cursor-grab p-2.5 transition-transform active:scale-[0.98]" key={l.n}>
                          <p className="truncate text-[0.75rem] font-medium">{l.n}</p>
                          <p className="ds-legenda truncate">{l.s}</p>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </Cartao>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

function Amostra({ nome, cor, nota }: { cor: string; nome: string; nota: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="size-10 rounded-[11px] shadow-[inset_0_0_0_1px_var(--ds-linha)]" style={{ background: cor }} />
      <div className="leading-tight">
        <p className="text-[0.8125rem] font-medium">{nome}</p>
        <p className="ds-legenda font-mono">{nota}</p>
      </div>
    </div>
  );
}

function Catalogo() {
  const meses = ["M1", "M2", "M3", "M4", "M5", "M6", "M7", "M8", "M9", "M10", "M11", "M12"];
  const [escolhidos, setEscolhidos] = useState<string[]>(["M2", "M3"]);
  const [ligados, setLigados] = useState([true, true, false]);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Cartao className="p-6">
        <p className="ds-sobretitulo">01 // cores</p>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <Amostra cor="var(--ds-fundo)" nome="Fundo" nota="--ds-fundo" />
          <Amostra cor="var(--ds-superficie)" nome="Superfície" nota="--ds-superficie" />
          <Amostra cor="var(--ds-botao)" nome="Botão principal" nota="--ds-botao" />
          <Amostra cor="var(--ds-acao)" nome="Cor de ação" nota="--ds-acao" />
          <Amostra cor="var(--ds-acao-suave)" nome="Ação suave" nota="--ds-acao-suave" />
          <Amostra cor="var(--ds-destaque)" nome="Destaque" nota="--ds-destaque" />
        </div>
      </Cartao>

      <Cartao className="p-6">
        <p className="ds-sobretitulo">02 // tipografia</p>
        <div className="mt-4 flex flex-col gap-3">
          <p className="ds-titulo-1">
            Quando se encaixam, <span className="ds-destaque">a venda vem</span>
          </p>
          <p className="ds-titulo-2">Título de secção</p>
          <p className="ds-titulo-3">Título de cartão</p>
          <p className="ds-corpo text-[var(--ds-texto-2)]">Texto corrido, para explicar uma coisa em uma ou duas linhas.</p>
          <p className="ds-numero text-4xl">$ 7,88k</p>
          <p className="ds-sobretitulo">Sobretítulo em mono</p>
        </div>
      </Cartao>

      <Cartao className="p-6">
        <p className="ds-sobretitulo">03 // botões</p>
        <div className="mt-4 flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <Botao tamanho="g">
              Agendar diagnóstico <ArrowRight size={16} />
            </Botao>
            <Botao variante="verde">Aprovar</Botao>
            <Botao variante="secundario">Dispensar</Botao>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <Botao tamanho="p">
              <Plus size={14} /> Novo lead
            </Botao>
            <Botao tamanho="p" variante="secundario">
              <Inbox size={14} /> Ver em lista
            </Botao>
            <Botao tamanho="p" variante="fantasma">
              Cancelar
            </Botao>
            <Botao tamanho="p" variante="perigo">
              Apagar
            </Botao>
            <Botao disabled tamanho="p">
              Desligado
            </Botao>
          </div>
        </div>
      </Cartao>

      <Cartao className="p-6">
        <p className="ds-sobretitulo">04 // selos e campos</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Selo ponto tom="verde">rodando</Selo>
          <Selo tom="verde">Definido</Selo>
          <Selo tom="neutro">Últimos 12 meses</Selo>
          <Selo ponto tom="alerta">Espera você · 29 min</Selo>
          <Selo tom="perigo">Falhou</Selo>
          <Selo tom="ouro">★ Cliente VIP</Selo>
          <Selo tom="escuro">marcado pelo agente</Selo>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <input className="ds-campo" placeholder="Nome do lead" />
          <input className="ds-campo" defaultValue="Clique aqui para ver o foco" />
        </div>
      </Cartao>

      <Cartao className="p-6">
        <p className="ds-sobretitulo">05 // seletores</p>
        <div className="mt-4 flex flex-col gap-5">
          <Segmentado
            onChange={(m) =>
              setEscolhidos((a) => (a.includes(m) ? a.filter((x) => x !== m) : [...a, m]))
            }
            opcoes={meses.map((m) => ({ label: m, valor: m }))}
            valor={escolhidos}
          />
          <div className="flex flex-col gap-3">
            {["Martim Cordeiro", "Roberto Silva", "Carolina Reis"].map((n, i) => (
              <div className="flex items-center gap-3" key={n}>
                <Avatar nome={n} />
                <div className="flex-1 leading-tight">
                  <p className="text-[0.8125rem] font-medium">{n}</p>
                  <p className="ds-legenda">{[14, 8, 11][i]} leads abertos</p>
                </div>
                <Interruptor
                  ligado={ligados[i]}
                  onChange={(v) => setLigados((a) => a.map((x, j) => (j === i ? v : x)))}
                  rotulo={`Receber leads: ${n}`}
                />
              </div>
            ))}
          </div>
        </div>
      </Cartao>

      <Cartao className="p-6">
        <p className="ds-sobretitulo">06 // progresso</p>
        <div className="mt-4 grid gap-6 sm:grid-cols-2">
          <Etapas
            itens={[
              { feita: true, titulo: "Responde em segundos", nota: "de dia ou às 23h" },
              { feita: true, titulo: "Qualifica o lead", nota: "o que quer e quando" },
              { feita: true, titulo: "Agenda o horário", nota: "na agenda certa" },
              { titulo: "Faz o follow-up", nota: "nenhum lead esfria" },
            ]}
          />
          <div className="flex flex-col gap-4">
            {[100, 72, 35, 8].map((v, i) => (
              <div className="flex flex-col gap-1.5" key={i}>
                <div className="flex justify-between text-[0.75rem]">
                  <span className="text-[var(--ds-texto-2)]">Etapa {i + 1}</span>
                  <span className="ds-numero">{v}%</span>
                </div>
                <Barra valor={v} />
              </div>
            ))}
          </div>
        </div>
      </Cartao>
    </div>
  );
}


const paletas = [
  {
    id: "coral", nome: "Coral", nota: "coral + tinta noturna", cores: ["#fff5ef", "#ff5a4e", "#1b1b3a"],
    conceito: "A secretária simpática. Calor humano, nada de cara de robô.",
    personalidade: ["acolhedora", "próxima", "sorridente"],
    mascote: "Um balão de conversa coral, redondo, que sorri e pisca quando responde.",
  },
  {
    id: "eletrica", nome: "Elétrica", nota: "ultramarino + lima ácida", cores: ["#f4f4f0", "#3a1cff", "#d4ff3a"],
    conceito: "Tecnologia que impressiona. Rápida, jovem, um pouco atrevida.",
    personalidade: ["rápida", "ousada", "nerd do bem"],
    mascote: "Uma faísca azul com olhos de pixel, que deixa um rastro lima quando corre.",
  },
  {
    id: "magenta", nome: "Magenta", nota: "magenta + verde", cores: ["#fff1f7", "#e6007e", "#00b386"],
    conceito: "Inesquecível. Uma cor que ninguém do setor usa.",
    personalidade: ["confiante", "vibrante", "memorável"],
    mascote: "Uma gota magenta com fones verdes, sempre pronta para atender.",
  },
  {
    id: "ceu", nome: "Céu", nota: "azul-céu + sol", cores: ["#f1f7ff", "#2d7ff9", "#ffb800"],
    conceito: "Otimista e fácil. Qualquer dono de negócio entende de primeira.",
    personalidade: ["clara", "otimista", "confiável"],
    mascote: "Uma nuvem azul com um solzinho no lugar do coração.",
  },
  {
    id: "uva", nome: "Uva", nota: "uva + menta", cores: ["#f5f2fb", "#4b1f8f", "#2fcf9f"],
    conceito: "Premium e calma. Combina com spa, estética e clínicas.",
    personalidade: ["elegante", "serena", "inteligente"],
    mascote: "Uma coruja uva de óculos menta, que sabe a agenda de cor.",
  },
  {
    id: "terracota", nome: "Terracota", nota: "terracota + pinho", cores: ["#fbf3ea", "#c2451e", "#2e5e4e"],
    conceito: "Feita à mão. Negócio local, conversa de balcão, confiança.",
    personalidade: ["artesanal", "calorosa", "honesta"],
    mascote: "Um vasinho de barro com uma folha de pinho que balança ao falar.",
  },
  {
    id: "amarelo", nome: "Amarelo", nota: "preto + amarelo vivo", cores: ["#fffaeb", "#1a1a1a", "#ffd60a"],
    conceito: "Marca forte, de outdoor. Contraste máximo, reconhecível de longe.",
    personalidade: ["direta", "enérgica", "bem-humorada"],
    mascote: "Um balão amarelo de traço preto grosso, estilo desenho animado.",
  },
  {
    id: "floresta", nome: "Floresta", nota: "verde-floresta + lima", cores: ["#f3f7ec", "#1f4d2b", "#b6f23a"],
    conceito: "Crescimento. O agente que faz o negócio do cliente crescer.",
    personalidade: ["sólida", "fresca", "de confiança"],
    mascote: "Um broto lima que cresce um pouco a cada cliente atendido.",
  },
] as const;

type IdPaleta = (typeof paletas)[number]["id"];

function SeletorPaleta({ onChange, valor }: { onChange: (v: IdPaleta) => void; valor: IdPaleta }) {
  return (
    <div className="ds-vidro flex max-w-full gap-1.5 overflow-x-auto rounded-[16px] p-1.5">
      {paletas.map((p) => (
        <button
          aria-pressed={p.id === valor}
          className="flex shrink-0 items-center gap-2 rounded-[11px] px-2.5 py-1.5 text-left transition-colors aria-pressed:bg-[var(--ds-superficie)] aria-pressed:shadow-[0_1px_2px_rgb(0_0_0/0.08),0_0_0_1px_var(--ds-linha)]"
          key={p.id}
          onClick={() => onChange(p.id)}
          type="button"
        >
          <span className="flex -space-x-1.5">
            {p.cores.map((c) => (
              <span className="size-4 rounded-full shadow-[0_0_0_1.5px_var(--ds-superficie),inset_0_0_0_1px_rgb(0_0_0/0.08)]" key={c} style={{ background: c }} />
            ))}
          </span>
          <span className="leading-tight">
            <span className="block text-[0.75rem] font-semibold">{p.nome}</span>
            <span className="block text-[0.625rem] text-[var(--ds-texto-3)]">{p.nota}</span>
          </span>
        </button>
      ))}
    </div>
  );
}


/** Rascunho de mascote: só para imaginar a marca, não é o desenho final. */
function RascunhoMascote() {
  return (
    <svg aria-hidden className="h-36 w-36" viewBox="0 0 120 120">
      <ellipse cx="60" cy="110" fill="var(--ds-texto)" opacity="0.08" rx="30" ry="5" />
      <path
        d="M60 14c26 0 44 16 44 38s-18 38-44 38c-5 0-10-.6-14-1.8L28 98l4-16C21 75 16 64 16 52 16 30 34 14 60 14Z"
        fill="var(--ds-acao)"
      />
      <ellipse cx="45" cy="50" fill="var(--ds-superficie)" rx="9" ry="11" />
      <ellipse cx="75" cy="50" fill="var(--ds-superficie)" rx="9" ry="11" />
      <circle cx="47" cy="52" fill="var(--ds-texto)" r="4.5" />
      <circle cx="77" cy="52" fill="var(--ds-texto)" r="4.5" />
      <path d="M48 68c6 6 18 6 24 0" fill="none" stroke="var(--ds-acao-texto)" strokeLinecap="round" strokeWidth="4" />
      <circle cx="94" cy="20" fill="var(--ds-mancha-2)" r="7" />
      <path d="M86 28l-6 6" stroke="var(--ds-mancha-2)" strokeLinecap="round" strokeWidth="4" />
    </svg>
  );
}

function DirecaoMarca({ id }: { id: IdPaleta }) {
  const p = paletas.find((x) => x.id === id) ?? paletas[0];
  return (
    <section className="ds-cartao grid items-center gap-8 overflow-hidden p-8 md:grid-cols-[auto_1fr_auto]">
      <div className="flex items-center justify-center">
        <RascunhoMascote />
      </div>
      <div className="flex flex-col gap-3">
        <p className="ds-sobretitulo">Direção de marca // {p.nome}</p>
        <p className="text-[2.75rem] leading-none font-semibold tracking-[-0.045em]">
          lexia<span className="ds-destaque">.</span>
        </p>
        <p className="ds-titulo-3 max-w-md">{p.conceito}</p>
        <div className="flex flex-wrap gap-1.5">
          {p.personalidade.map((x) => (
            <Selo key={x} tom="verde">{x}</Selo>
          ))}
        </div>
        <p className="ds-corpo max-w-md text-[var(--ds-texto-2)]">
          <span className="font-medium text-[var(--ds-texto)]">Mascote: </span>
          {p.mascote}
        </p>
      </div>
      <div className="flex gap-2 md:flex-col">
        {p.cores.map((c, i) => (
          <div className="flex items-center gap-2.5" key={c}>
            <span className="size-11 rounded-[12px] shadow-[inset_0_0_0_1px_var(--ds-linha)]" style={{ background: c }} />
            <span className="hidden leading-tight md:block">
              <span className="block text-[0.75rem] font-medium">{["Fundo", "Principal", "Destaque"][i]}</span>
              <span className="ds-legenda block font-mono">{c}</span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

type Modo = "claro" | "escuro";

export function Vitrine() {
  const [paleta, setPaleta] = useState<IdPaleta>("coral");
  const [modo, setModo] = useState<Modo>("claro");

  // A paleta vai no endereço (/design#coral-escuro) para dar para partilhar.
  useEffect(() => {
    const ler = () => {
      const [h, m] = window.location.hash.slice(1).split("-");
      if (paletas.some((p) => p.id === h)) setPaleta(h as IdPaleta);
      setModo(m === "escuro" ? "escuro" : "claro");
    };
    ler();
    window.addEventListener("hashchange", ler);
    return () => window.removeEventListener("hashchange", ler);
  }, []);

  const escolher = (v: IdPaleta, m: Modo = modo) => {
    setPaleta(v);
    setModo(m);
    history.replaceState(null, "", `#${v}${m === "escuro" ? "-escuro" : ""}`);
  };
  return (
    <div className="ds relative min-h-screen" data-modo={modo} data-paleta={paleta}>
      <div aria-hidden className="ds-aurora" />
      <div className="relative z-[1] mx-auto flex max-w-[1320px] flex-col gap-10 px-4 py-12 sm:px-8">
        <header className="flex flex-col items-center gap-4 text-center">
          <span className="ds-entrar" style={{ ["--i" as string]: 0 }}>
            <Selo ponto tom="verde">Design system · v1</Selo>
          </span>
          <h1 className="ds-titulo-1 ds-entrar max-w-2xl" style={{ ["--i" as string]: 1 }}>
            O painel da Lexia, <span className="ds-destaque">mais leve</span>
          </h1>
          <p className="ds-corpo ds-entrar max-w-lg text-[var(--ds-texto-2)]" style={{ ["--i" as string]: 2 }}>
            Uma tela de exemplo já no estilo novo, e abaixo todas as peças que as telas vão usar.
          </p>
        </header>

        <div className="sticky top-3 z-20 flex flex-wrap items-center justify-center gap-2">
          <SeletorPaleta onChange={(v) => escolher(v)} valor={paleta} />
          <div className="ds-vidro rounded-[16px] p-1.5">
            <Trilho
              onChange={(m) => escolher(paleta, m)}
              opcoes={[
                { label: "☀︎ Claro", valor: "claro" },
                { label: "☾ Escuro", valor: "escuro" },
              ]}
              valor={modo}
            />
          </div>
        </div>

        <DirecaoMarca id={paleta} />

        <section className="ds-entrar" style={{ ["--i" as string]: 3 }}>
          <TelaExemplo />
        </section>

        <section className="ds-entrar flex flex-col gap-4" style={{ ["--i" as string]: 4 }}>
          <h2 className="ds-titulo-2">As peças</h2>
          <Catalogo />
        </section>
      </div>
    </div>
  );
}
