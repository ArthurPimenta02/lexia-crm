-- Fase 14 — agenda
--
-- Esta migration pertence ao Supabase CENTRAL da Lexia.
--
-- O que resolve
-- -------------
-- A coluna "Agendado" do kanban não tem de onde sair, e a plataforma não tem
-- onde mostrar o dia de trabalho de quem a usa. O que existe hoje são três
-- sítios diferentes, nenhum deles alcançável por SQL a partir daqui:
--
--   detail_by_cordeiro  detailbycordeiro@gmail.com                  (Martim)
--   detail_by_cordeiro  176493f4…@group.calendar.google.com         (Roberto)
--   miranda_skin_experts  smouramiranda@gmail.com                   (Samuel)
--
-- e, ao lado, duas tabelas na base de cada cliente com o que o AGENTE marcou:
-- `marcacoes` no Detail (20 linhas, de 30/07 a 13/10) e
-- `agendamentos_miranda_skin` na Miranda (47 linhas). Esta tabela junta as
-- três agendas numa forma só, para o painel ler uma tabela e não saber de onde
-- veio cada linha.
--
-- Porque é que o Google não chega e as tabelas do cliente também não
-- ------------------------------------------------------------------
-- As tabelas do cliente só sabem do que o agente marcou. Medido a 2026-10-17
-- numa janela do agente de lembretes: o Google tinha 3 eventos, a `marcacoes`
-- tinha 1. O que o Martim escreve à mão na agenda — e é a maioria — nunca lá
-- chega. Um kanban alimentado só pela `marcacoes` mostrava a coluna "Agendado"
-- quase vazia com 1007 conversas em cima, e a culpa não era do kanban.
--
-- Ao contrário, o Google sabe de todos os eventos mas não sabe de nenhum
-- cliente: o evento real "Sacramento, 09:00–15:00" não tem telefone, não tem
-- serviço e não tem valor. Essa parte só existe na tabela do cliente.
--
-- Porque é que `origem` é medida e não adivinhada
-- ----------------------------------------------
-- Há a tentação de olhar para o título do evento e decidir pela forma. Não é
-- preciso: as duas tabelas de cliente guardam o id do evento que criaram —
-- `marcacoes.event_id_google` no Detail, `agendamentos_miranda_skin.event_id`
-- na Miranda (que até já tem um `criado_via` escrito). Um evento cujo id está
-- lá foi do agente; um que não está foi de um humano. É exacto.
--
-- Fica uma corrida: o agente cria o evento no Google e só depois escreve a
-- linha na base dele. Uma sincronização que apanhe o meio marca o evento como
-- manual. Por isso a sincronização relê sempre uma janela inteira e reescreve
-- a `origem` — o erro corrige-se sozinho no ciclo seguinte, em vez de ficar
-- uma marcação do agente contada para sempre como manual.
--
-- Porque é um espelho e não a fonte da verdade
-- -------------------------------------------
-- A fonte continua a ser o Google. É o Google que os agentes de IA consultam
-- quando verificam disponibilidade — confirmado: tanto o
-- `verificar_disponibilidade` do Detail como o da Miranda lêem a agenda
-- directamente, e nenhum lê Supabase para isso. Logo, o que a aba Agenda vier
-- a criar tem de ir ao Google primeiro; esta tabela recebe-o a seguir. Se
-- fosse ao contrário, o painel marcava uma consulta e o agente continuava a
-- oferecer aquela hora a outro cliente.
--
-- Por ser espelho, não leva o gatilho de append-only da `lexia_eventos`: uma
-- linha aqui TEM de poder mudar, porque o evento no Google muda de hora.
--
-- Porque é que o `identificador_conversa` não é uma coluna
-- -------------------------------------------------------
-- Era o atalho óbvio para o cartão do kanban, mas congelava a ligação. Os
-- contactos juntam-se (`lexia_contactos.fundido_em`), e um agendamento preso
-- ao contacto duplicado deixava de aparecer na ficha do principal. Guarda-se o
-- telefone e resolve-se na leitura, que é o que respeita a junção. Medido: 16
-- das 20 marcações do Detail casam já com um contacto central pelos dígitos;
-- as outras 4 são números de 9 dígitos escritos à mão, sem o 351.

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

create table if not exists public.lexia_agendamentos (
  id uuid primary key default gen_random_uuid(),

  cliente_slug text not null
    references public.lexia_clientes(slug) on delete cascade,

  -- Qual das agendas. Um cliente tem mais do que uma (o Detail tem a do Martim
  -- e a do Roberto), e o id do evento só é único dentro de uma.
  calendario_id text not null
    check (char_length(calendario_id) between 3 and 300),
  event_id text not null
    check (char_length(event_id) between 1 and 1024),

  -- Quando -----------------------------------------------------------------

  inicio timestamptz not null,
  fim timestamptz not null,

  -- Um evento de dia inteiro vem do Google como data sem hora. Guarda-se na
  -- mesma como intervalo, mas a aba Agenda tem de o desenhar na faixa de cima
  -- e não como um bloco das 00:00 às 00:00.
  dia_inteiro boolean not null default false,

  -- O fuso com que o evento foi escrito. O Detail trabalha em Europe/Lisbon e
  -- a Miranda em America/New_York; sem isto, mostrar "14:00" a um e ao outro
  -- obrigava a adivinhar qual.
  fuso text
    check (fuso is null or char_length(fuso) <= 60),

  constraint lexia_agendamentos_fim_depois_do_inicio
    check (fim >= inicio),

  -- O quê -------------------------------------------------------------------

  titulo text
    check (titulo is null or char_length(titulo) <= 500),
  descricao text
    check (descricao is null or char_length(descricao) <= 8000),
  localizacao text
    check (localizacao is null or char_length(localizacao) <= 500),

  -- `cancelado` existe de propósito. Quando um evento desaparece da agenda, a
  -- sincronizacao marca-o em vez de apagar a linha: "quantas marcações se
  -- desmarcaram neste mês" é uma pergunta que o Martim vai fazer, e uma linha
  -- apagada não responde a nada.
  estado text not null default 'confirmado'
    check (estado in ('confirmado', 'provisorio', 'cancelado')),

  -- Quem --------------------------------------------------------------------
  --
  -- Só vem preenchido quando o evento é do agente: um evento escrito à mão na
  -- agenda tem um título e mais nada.

  nome_cliente text
    check (nome_cliente is null or char_length(nome_cliente) <= 200),
  telefone text
    check (telefone is null or char_length(telefone) <= 60),
  telefone_digitos text
    generated always as (
      nullif(regexp_replace(coalesce(telefone, ''), '[^0-9]', '', 'g'), '')
    ) stored,
  email text
    check (email is null or char_length(email) <= 320),

  -- De onde veio -------------------------------------------------------------

  origem text not null default 'manual'
    check (origem in ('agente', 'manual', 'painel')),

  -- Quem executa. `executor` no Detail (martim/roberto), `profissional` na
  -- Miranda (Samuel). É o mesmo conceito, por isso é a mesma coluna.
  executor text
    check (executor is null or char_length(executor) <= 120),
  servico text
    check (servico is null or char_length(servico) <= 300),
  valor_previsto numeric(12, 2)
    check (valor_previsto is null or valor_previsto >= 0),

  -- A linha correspondente na base do cliente, quando existe. Não é uma chave
  -- estrangeira porque a tabela está noutro Supabase; serve para ir lá buscar
  -- o resto sem ter de procurar pelo telefone.
  referencia_cliente uuid,

  -- Rasto --------------------------------------------------------------------

  criado_no_google timestamptz,
  actualizado_no_google timestamptz,
  link_google text
    check (link_google is null or char_length(link_google) <= 1000),

  sincronizado_em timestamptz not null default now(),
  criado_em timestamptz not null default now(),

  -- O resto do evento como o Google o deu, para quando faltar um campo que
  -- ainda não sabíamos que era preciso.
  dados jsonb not null default '{}'::jsonb
    check (jsonb_typeof(dados) = 'object'),

  constraint lexia_agendamentos_evento_unico
    unique (cliente_slug, calendario_id, event_id)
);

-- --------------------------------------------------------------------------
-- 2. Índices
-- --------------------------------------------------------------------------

-- A aba Agenda pede sempre uma janela de dias deste cliente, e o kanban pede
-- "tem alguma marcação daqui para a frente".
create index if not exists lexia_agendamentos_cliente_inicio_idx
  on public.lexia_agendamentos (cliente_slug, inicio);

-- Para o cartão do kanban e a ficha do contacto encontrarem as marcações da
-- pessoa sem varrer a tabela.
create index if not exists lexia_agendamentos_telefone_idx
  on public.lexia_agendamentos (cliente_slug, telefone_digitos, inicio)
  where telefone_digitos is not null;

-- "Quanto é que o agente marcou este mês, e quanto foi marcado à mão" é a
-- pergunta que justifica o agente.
create index if not exists lexia_agendamentos_origem_idx
  on public.lexia_agendamentos (cliente_slug, origem, inicio)
  where estado <> 'cancelado';

-- A sincronização apaga-e-repõe por janela: precisa de achar depressa tudo o
-- que já tem daquela agenda naquele intervalo.
create index if not exists lexia_agendamentos_calendario_idx
  on public.lexia_agendamentos (cliente_slug, calendario_id, inicio);

-- --------------------------------------------------------------------------
-- 3. O que o gatilho protege
-- --------------------------------------------------------------------------
--
-- Duas coisas que um nó do n8n mal configurado estragaria em silêncio.
--
-- O carimbo: sem ele, um `upsert` que não mexa em nada deixa `sincronizado_em`
-- com a data antiga, e deixa de se poder distinguir "a agenda não mudou" de
-- "a sincronização parou há dois dias". A segunda é uma avaria e tem de dar
-- nas vistas.
--
-- A origem: a sincronização marca `manual` tudo o que não encontra na tabela
-- de marcações do cliente, e um evento criado na aba Agenda nunca lá está.
-- Sem esta regra, bastava um ciclo para o painel perder o rasto de tudo o que
-- ele próprio criou. Fica aqui, e não no workflow, porque é uma propriedade
-- da tabela: `painel` é mais específico que `manual` e não se perde.
-- `agente` sobrepõe-se sempre, que é o que resolve a corrida descrita no
-- cabeçalho.

create or replace function public.lexia_agendamentos_antes_de_escrever()
returns trigger
language plpgsql
as $$
begin
  new.sincronizado_em := now();

  if old.origem = 'painel' and new.origem = 'manual' then
    new.origem := 'painel';
  end if;

  return new;
end;
$$;

drop trigger if exists lexia_agendamentos_toca_sincronizado_trg
  on public.lexia_agendamentos;
drop trigger if exists lexia_agendamentos_antes_de_escrever_trg
  on public.lexia_agendamentos;
create trigger lexia_agendamentos_antes_de_escrever_trg
  before update on public.lexia_agendamentos
  for each row execute function public.lexia_agendamentos_antes_de_escrever();

-- --------------------------------------------------------------------------
-- 4. Permissões
-- --------------------------------------------------------------------------
--
-- Só leitura para o `authenticated`, como nas outras tabelas centrais. Quem
-- escreve é a sincronização do n8n e as server actions da aba Agenda, ambas
-- pela `service_role` — e as actions escrevem no Google primeiro, porque é o
-- Google que os agentes consultam.

alter table public.lexia_agendamentos enable row level security;

drop policy if exists "lexia_agendamentos_select" on public.lexia_agendamentos;
create policy "lexia_agendamentos_select"
on public.lexia_agendamentos for select to authenticated
using (
  exists (
    select 1
    from public.lexia_usuarios_clientes perfil
    where perfil.user_id = auth.uid()
      and perfil.status = 'ativo'
      and (
        perfil.role = 'lexia_admin'
        or perfil.cliente_slug = lexia_agendamentos.cliente_slug
      )
  )
);

revoke all on public.lexia_agendamentos from anon, authenticated;
grant select on public.lexia_agendamentos to authenticated;

comment on table public.lexia_agendamentos is
  'Espelho das agendas do Google dos clientes, enriquecido com o que o agente marcou. A fonte da verdade e o Google: escrever aqui sem escrever la deixa o agente a oferecer horas ja ocupadas.';
comment on column public.lexia_agendamentos.origem is
  'agente = o id do evento esta na tabela de marcacoes do cliente. manual = alguem escreveu na agenda. painel = criado na aba Agenda. Medido, nao adivinhado pelo titulo.';
comment on column public.lexia_agendamentos.estado is
  'cancelado em vez de apagar a linha, para se poder contar quantas marcacoes se desmarcaram.';
comment on column public.lexia_agendamentos.sincronizado_em is
  'Carimbo tocado por gatilho em cada escrita. Serve para distinguir uma agenda parada de uma sincronizacao parada.';
comment on function public.lexia_agendamentos_antes_de_escrever() is
  'Toca o sincronizado_em e impede que a sincronizacao rebaixe um evento criado no painel para manual.';

commit;
