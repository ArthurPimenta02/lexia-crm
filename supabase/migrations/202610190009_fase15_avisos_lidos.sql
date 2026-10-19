-- Fase 15 — avisos lidos
--
-- Esta migration pertence ao Supabase CENTRAL da Lexia.
--
-- O que resolve
-- -------------
-- O painel nunca avisa de nada. Os avisos de handoff saem para o WhatsApp da
-- equipa e ficam por aí; quem abre o painel não tem onde ver que alguém está
-- à espera. O sino resolve isso, mas um sino tem um problema que os outros
-- ecrãs não têm: tem de saber o que já foi visto. Sem isso fica vermelho para
-- sempre e em três dias ninguém olha para ele.
--
-- Esta é a ÚNICA tabela que o sino precisa. Os avisos em si não se guardam —
-- já estão todos na base e derivam-se na leitura:
--
--   quem escreveu e ninguém respondeu   ->  lexia_mensagens
--   handoffs em aberto                  ->  lexia_handoffs
--   marcações nas próximas 24 horas     ->  lexia_agendamentos
--
-- Guardar os avisos obrigaria a mantê-los em sincronia com os factos de que
-- saem, e um aviso que já foi resolvido e continua na tabela é pior do que
-- não haver aviso nenhum.
--
-- Porque é que a chave é texto e não o id de uma linha
-- ---------------------------------------------------
-- Um aviso não é uma linha de nenhuma tabela: é uma SITUAÇÃO. "O Thiago
-- escreveu e ninguém respondeu" não tem id. E, mais importante, a situação
-- tem de poder voltar a acender o sino quando muda: se o Thiago escrever
-- outra vez amanhã, isso é um aviso novo, não o mesmo já lido.
--
-- Por isso a chave carrega o instante do facto:
--
--   por_responder:whatsapp:351925252340:2026-10-19T14:47:00.000Z
--   handoff:<id>:em_atendimento
--   marcacao:<id>:2026-10-20T10:00:00.000Z
--
-- Marcar como lido grava a chave. Quando chega mensagem nova, o instante muda,
-- a chave muda, e o aviso volta — que é exactamente o que se quer. Um id de
-- linha não dava isto: ficava lido para sempre à primeira vez.
--
-- Porque é que é por utilizador e não por cliente
-- ----------------------------------------------
-- Medido a 2026-10-19: hoje há um login real por cliente
-- (detailbycordeiro@gmail.com e mirandaskinexpert@gmail.com), portanto por
-- utilizador e por cliente dariam o mesmo resultado. Fica por utilizador
-- porque é o que é correcto no dia em que o Roberto tiver conta própria — e
-- porque a alternativa, guardar por `cliente_slug`, obrigava a uma migração
-- de dados nesse dia em vez de nenhuma.
--
-- Enquanto o Martim e o Roberto partilharem o mesmo login, um marcar como
-- lido marca para o outro. Isso não é defeito desta tabela: é consequência de
-- partilharem a conta, e resolve-se com uma conta para cada um.
--
-- Porque é que não há `cliente_slug` a fazer de chave
-- --------------------------------------------------
-- Há, mas só para o isolamento e para se poder limpar por cliente. A
-- unicidade é `(user_id, chave)` porque um utilizador pertence a um cliente:
-- pôr o slug na unicidade deixava a mesma pessoa marcar a mesma chave duas
-- vezes se algum dia mudasse de cliente, e não protege nada.

begin;

-- --------------------------------------------------------------------------
-- 1. A tabela
-- --------------------------------------------------------------------------

create table if not exists public.lexia_avisos_lidos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  cliente_slug text not null,
  chave text not null,
  lido_em timestamptz not null default now(),
  unique (user_id, chave)
);

-- A leitura do sino é sempre "as chaves lidas por esta pessoa". Só este
-- índice é que serve; o do `cliente_slug` serve para limpar.
create index if not exists lexia_avisos_lidos_user_idx
  on public.lexia_avisos_lidos (user_id);

create index if not exists lexia_avisos_lidos_cliente_idx
  on public.lexia_avisos_lidos (cliente_slug, lido_em desc);

-- --------------------------------------------------------------------------
-- 2. Permissões
-- --------------------------------------------------------------------------
--
-- Esta tabela é a excepção às outras centrais: o `authenticated` também
-- ESCREVE, porque marcar como lido é um gesto do utilizador e não uma
-- sincronização. Mas só escreve as suas próprias linhas — o `with check`
-- amarra o `user_id` ao `auth.uid()`, por isso ninguém marca avisos em nome
-- de outra pessoa, mesmo com o token na mão.
--
-- Na prática o painel escreve pela `service_role` como o resto do produto;
-- estas políticas são a rede por baixo disso.

alter table public.lexia_avisos_lidos enable row level security;

drop policy if exists "lexia_avisos_lidos_select" on public.lexia_avisos_lidos;
create policy "lexia_avisos_lidos_select"
on public.lexia_avisos_lidos for select to authenticated
using (user_id = auth.uid());

drop policy if exists "lexia_avisos_lidos_insert" on public.lexia_avisos_lidos;
create policy "lexia_avisos_lidos_insert"
on public.lexia_avisos_lidos for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.lexia_usuarios_clientes perfil
    where perfil.user_id = auth.uid()
      and perfil.status = 'ativo'
      and (
        perfil.role = 'lexia_admin'
        or perfil.cliente_slug = lexia_avisos_lidos.cliente_slug
      )
  )
);

-- Desmarcar é apagar a linha: o aviso volta a aparecer. Só as próprias.
drop policy if exists "lexia_avisos_lidos_delete" on public.lexia_avisos_lidos;
create policy "lexia_avisos_lidos_delete"
on public.lexia_avisos_lidos for delete to authenticated
using (user_id = auth.uid());

revoke all on public.lexia_avisos_lidos from anon, authenticated;
grant select, insert, delete on public.lexia_avisos_lidos to authenticated;

comment on table public.lexia_avisos_lidos is
  'O que cada pessoa ja viu no sino. Os avisos nao se guardam - derivam-se de lexia_mensagens, lexia_handoffs e lexia_agendamentos na leitura. Esta tabela so guarda o "ja li isto".';
comment on column public.lexia_avisos_lidos.chave is
  'Identifica a SITUACAO e carrega o instante do facto, para que o aviso volte a acender quando a situacao muda. Ex: por_responder:whatsapp:351925252340:2026-10-19T14:47:00.000Z';
comment on column public.lexia_avisos_lidos.user_id is
  'Por utilizador e nao por cliente_slug: hoje da o mesmo (um login por cliente) mas evita migrar dados no dia em que cada pessoa tiver conta propria.';

commit;
