-- Fase 13 — log de eventos
--
-- Esta migration pertence ao Supabase CENTRAL da Lexia.
--
-- O que resolve
-- -------------
-- O painel sabe dizer o que foi dito — tem 9480 mensagens do Detail e 7390 da
-- Miranda — mas não sabe dizer o que ACONTECEU. Que um follow-up foi marcado
-- para quinta, que a etapa 2 foi saltada porque o juiz achou cedo demais, que
-- um lembrete saiu, que a conversa foi entregue a um humano. Nada disso deixa
-- rasto nesta base, e sem rasto não há "quanto tempo esteve nesta etapa" nem
-- "quantos leads se perdem entre a primeira e a segunda tentativa".
--
-- Porque é que o estado dos follow-ups não chega aqui
-- --------------------------------------------------
-- Há uma tabela `lexia_followups`, e ela funciona. Só que vive em cada base de
-- cliente, não nesta: a do Detail está no Supabase `DetailByCodeiro` e usa a
-- chave `identificador`, com o slug colado à frente ('detail_by_cordeiro:…');
-- a da Miranda está no Supabase dela e usa `id`, com o slug numa coluna à
-- parte. Dois esquemas diferentes, duas bases diferentes, nenhuma delas
-- alcançável por SQL a partir daqui.
--
-- A mensagem do follow-up já chega — o n8n grava-a em `lexia_mensagens` com
-- `origem = 'followup_agente'` (medido a 2026-10-17: 180 mensagens em 107
-- conversas do Detail, 764 em 374 da Miranda). O que não chega é a transição:
-- quando foi marcado, para quando, em que etapa, e porque foi encerrado.
--
-- Porque é uma tabela e não dez
-- ----------------------------
-- A alternativa era `lexia_followups` + `lexia_lembretes` + `lexia_handoffs`
-- centrais, cada uma com o seu esquema. Cada coisa nova que o agente passasse
-- a fazer seria uma migration e um deploy antes de o n8n a poder gravar. Com
-- um `tipo` livre e um `dados` jsonb, acrescentar um evento novo é configurar
-- um nó — e o painel ignora os tipos que ainda não sabe desenhar em vez de
-- rebentar.
--
-- O preço é que o Postgres deixa de validar a forma do `dados`. Aceita-se: o
-- que tem de estar certo — o inquilino, o momento, a conversa — são colunas a
-- sério, com restrições a sério.
--
-- Porque é que a chave de idempotência é obrigatória
-- -------------------------------------------------
-- O n8n repete nós que falham, e repete-os a sério: o workflow de follow-up do
-- Detail deu 17 erros em 100 execuções nas últimas 24h, todos no envio, todos
-- com o mesmo (#551) da Meta. Cada repetição que gravasse outra vez o mesmo
-- evento somaria um follow-up que nunca existiu. Como a coluna é `not null` e
-- única por cliente, o nó é obrigado a dizer qual é o evento, e a segunda
-- tentativa do mesmo evento não passa de um `upsert` silencioso.
--
-- Porque é append-only
-- -------------------
-- O que o log vale é a história. Uma linha que se pode reescrever deixa de
-- servir para medir — bastava um workflow corrigir o passado para o "tempo em
-- etapa" mudar de valor sem ninguém notar. Por isso o `authenticated` só tem
-- `select`, e nem o painel nem o n8n têm por onde apagar sem ser pela
-- `service_role`.
--
-- Nota sobre o kanban
-- ------------------
-- A coluna do kanban continua a NÃO sair daqui. É derivada do estado actual —
-- última mensagem, marcação futura — e esta tabela é para as métricas e para a
-- linha do tempo do cartão. Um log com buracos (um workflow que falhou a meio)
-- não pode ser o que decide em que coluna um lead aparece, ou leads ficam
-- presos na coluna errada e as pessoas deixam de confiar no board.

begin;

do $$
begin
  if to_regclass('public.lexia_contactos') is null then
    raise exception
      'lexia_contactos nao existe nesta base. Esta migration pertence ao Supabase CENTRAL da Lexia, nao ao projecto de um cliente.';
  end if;
end;
$$;

-- --------------------------------------------------------------------------
-- 1. A tabela
-- --------------------------------------------------------------------------

create table if not exists public.lexia_eventos (
  id uuid primary key default gen_random_uuid(),

  cliente_slug text not null
    references public.lexia_clientes(slug) on delete cascade,

  -- O que aconteceu. Texto livre de propósito: ver o comentário do cabeçalho.
  -- A restrição é só de forma, para não entrarem tipos com espaços ou
  -- maiúsculas que depois não casam no filtro.
  tipo text not null
    check (tipo ~ '^[a-z][a-z0-9_]{2,47}$'),

  -- Quando aconteceu de verdade, que não é quando a linha foi escrita: o n8n
  -- pode gravar uma hora depois, e o `criado_em` mentiria sobre o momento.
  ocorrido_em timestamptz not null default now(),
  criado_em timestamptz not null default now(),

  -- A conversa a que o evento pertence. Nulo é um caso real e não um defeito:
  -- o lembrete do Detail nasce de um evento da agenda do Google, que não
  -- conhece conversa nenhuma — só tem o telemóvel escrito no evento.
  identificador_conversa text
    check (identificador_conversa is null or char_length(identificador_conversa) <= 200),

  -- A ponte para quando não há conversa. Os dígitos são calculados pela mesma
  -- razão que em `lexia_contactos.telefone_digitos`: a Meta entrega o mesmo
  -- número em dois formatos, e comparar o texto não os vê como o mesmo.
  telefone text
    check (telefone is null or char_length(telefone) <= 60),
  telefone_digitos text
    generated always as (
      nullif(regexp_replace(coalesce(telefone, ''), '[^0-9]', '', 'g'), '')
    ) stored,

  -- Idempotência. O nó do n8n escolhe-a de forma a ser a mesma se o evento for
  -- repetido — por exemplo 'followup:<identificador>:etapa2:enviado'.
  chave text not null
    check (char_length(chave) between 3 and 200),

  -- Quem escreveu: o nome do workflow, ou 'painel' quando a origem é humana.
  -- Serve para saber a quem ir pedir contas quando um número parecer errado.
  origem text not null
    check (char_length(origem) between 2 and 120),

  dados jsonb not null default '{}'::jsonb
    check (jsonb_typeof(dados) = 'object'),

  -- Um evento não pode ser órfão das duas pontas: ou sabe a conversa, ou sabe
  -- o telefone. Sem nenhum dos dois não há a que cartão o encostar, e ficava
  -- uma linha a somar para uma métrica que ninguém consegue abrir.
  constraint lexia_eventos_tem_a_quem_pertencer
    check (identificador_conversa is not null or telefone is not null),

  constraint lexia_eventos_chave_unica
    unique (cliente_slug, chave)
);

-- --------------------------------------------------------------------------
-- 2. Índices
-- --------------------------------------------------------------------------

-- A pergunta do painel é sempre "os eventos deste cliente, do mais recente
-- para trás", muitas vezes apertada a um intervalo de datas.
create index if not exists lexia_eventos_cliente_tempo_idx
  on public.lexia_eventos (cliente_slug, ocorrido_em desc);

-- A linha do tempo de um cartão do kanban.
create index if not exists lexia_eventos_conversa_idx
  on public.lexia_eventos (cliente_slug, identificador_conversa, ocorrido_em desc)
  where identificador_conversa is not null;

-- Para os eventos que só trazem telemóvel encontrarem o contacto.
create index if not exists lexia_eventos_telefone_idx
  on public.lexia_eventos (cliente_slug, telefone_digitos)
  where telefone_digitos is not null;

-- "Quantos follow-ups de etapa 2 saíram em Setembro" é um filtro por tipo
-- dentro do cliente.
create index if not exists lexia_eventos_tipo_idx
  on public.lexia_eventos (cliente_slug, tipo, ocorrido_em desc);

-- --------------------------------------------------------------------------
-- 3. Append-only
-- --------------------------------------------------------------------------
--
-- Sem isto, a `service_role` — que é a chave que o n8n usa — podia reescrever
-- o passado por engano num nó mal configurado. O log deixaria de ser log.

create or replace function public.lexia_eventos_sem_reescrita()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'lexia_eventos e append-only: nao se altera nem se apaga um evento (tentativa em % %)',
    tg_op, coalesce(old.id::text, '');
end;
$$;

drop trigger if exists lexia_eventos_sem_reescrita_trg on public.lexia_eventos;
create trigger lexia_eventos_sem_reescrita_trg
  before update or delete on public.lexia_eventos
  for each row execute function public.lexia_eventos_sem_reescrita();

-- --------------------------------------------------------------------------
-- 4. Permissões
-- --------------------------------------------------------------------------

alter table public.lexia_eventos enable row level security;

drop policy if exists "lexia_eventos_select" on public.lexia_eventos;
create policy "lexia_eventos_select"
on public.lexia_eventos for select to authenticated
using (
  exists (
    select 1
    from public.lexia_usuarios_clientes perfil
    where perfil.user_id = auth.uid()
      and perfil.status = 'ativo'
      and (perfil.role = 'lexia_admin' or perfil.cliente_slug = lexia_eventos.cliente_slug)
  )
);

revoke all on public.lexia_eventos from anon, authenticated;
grant select on public.lexia_eventos to authenticated;

comment on table public.lexia_eventos is
  'Log append-only do que o agente fez: follow-ups marcados e enviados, lembretes, handoffs. Escrito pelo n8n com a service_role. A coluna do kanban NAO sai daqui — sai do estado actual.';
comment on column public.lexia_eventos.ocorrido_em is
  'Quando o evento aconteceu, que pode ser antes de a linha ser escrita. Usar este e nao o criado_em para medir.';
comment on column public.lexia_eventos.chave is
  'Idempotencia. O no do n8n repete-se quando falha; a mesma chave tem de dar a mesma linha, nunca uma segunda.';
comment on column public.lexia_eventos.dados is
  'O resto do evento, sem forma fixa. O painel ignora o que nao sabe desenhar.';

commit;
