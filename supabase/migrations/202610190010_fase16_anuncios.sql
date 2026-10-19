-- Fase 16: dar nome ao anuncio de onde veio o contacto.
--
-- O PROBLEMA QUE RESOLVE
-- O agente ja guarda a origem na ficha: lexia_contactos.origem_source_id. Mas
-- o referral da Meta traz o id do ANUNCIO, nunca o da campanha -- um numero de
-- 18 digitos como 120237312707190118. No painel isso nao e informacao; e um
-- numero que ninguem sabe ler. Esta tabela e o dicionario que o traduz em
-- "Prospecao Detail | 25-11 / FB+IG - Pub quente [Lisboa 40km] 18-65 / ad - V1".
--
-- PORQUE E UMA TABELA E NAO UMA CHAMADA A META NA HORA
-- 1. A leitura do painel corre com o cliente autenticado e passa por RLS. Uma
--    chamada a Marketing API dentro do render punha o token da Lexia no
--    caminho de cada pagina, e a Meta responde em centenas de milissegundos.
-- 2. Anuncio apagado na Meta deixa de aparecer em /ads, mas a ficha do
--    contacto guarda o id para sempre. Sem espelho, o contacto de ha tres
--    meses perdia o nome da campanha no dia em que o cliente arrumou a conta.
--    E o mesmo motivo do buildCampanhaRows em lib/meta/sync.ts.
--
-- PORQUE CONJUNTO E CAMPANHA VIVEM AQUI, DESNORMALIZADOS
-- Medido em 19/10/2026 contra act_713888634370334: 73 anuncios numa unica
-- pagina, todos com adset e campaign preenchidos. Duas tabelas novas
-- (conjuntos, e a ligacao a lexia_campanhas) davam duas juncoes a mais para
-- mostrar tres palavras no ecra. O nome fica gravado no momento da
-- sincronizacao, e isso tambem e o que se quer: se o cliente renomear a
-- campanha, a sincronizacao seguinte actualiza, mas um anuncio apagado
-- conserva o nome que tinha.
--
-- A campanha_externa_id aqui NAO tem foreign key para lexia_campanhas. De
-- proposito: a sincronizacao escreve as duas tabelas no mesmo passo, e uma FK
-- faria a escrita dos anuncios depender da ordem. Junta-se por valor quando
-- for preciso.
--
-- Esta migration e aditiva: cria uma tabela nova e nao toca em nada existente.

begin;

-- Guard: o risco real e correr isto no Supabase errado. Cada cliente tem o seu
-- projecto; anuncios vivem apenas na base central da Lexia, a unica com
-- lexia_clientes.
do $$
begin
  if to_regclass('public.lexia_clientes') is null then
    raise exception
      'lexia_clientes nao existe nesta base. Esta migration pertence ao Supabase CENTRAL da Lexia, nao ao projecto de um cliente.';
  end if;
end;
$$;

create table if not exists public.lexia_anuncios (
  id uuid primary key default extensions.gen_random_uuid(),
  cliente_slug text not null references public.lexia_clientes(slug)
    on update cascade on delete restrict,
  plataforma text not null check (plataforma in ('meta', 'google')),
  -- ID do anuncio na plataforma. Texto, nao bigint: a Meta devolve string e
  -- estes ids passam dos 15 digitos. Nunca fazer aritmetica com isto.
  anuncio_externo_id text not null
    check (char_length(anuncio_externo_id) between 1 and 128),
  -- O nome do criativo, tal como o cliente o escreveu no Gestor de Anuncios.
  nome text not null check (char_length(nome) between 1 and 512),
  estado text check (char_length(estado) between 1 and 64),
  conjunto_externo_id text
    check (char_length(conjunto_externo_id) between 1 and 128),
  conjunto_nome text check (char_length(conjunto_nome) between 1 and 512),
  campanha_externa_id text
    check (char_length(campanha_externa_id) between 1 and 128),
  campanha_nome text check (char_length(campanha_nome) between 1 and 512),
  conta_externa_id text check (char_length(conta_externa_id) between 1 and 128),
  sincronizado_em timestamptz not null default now(),
  criado_em timestamptz not null default now(),
  constraint lexia_anuncios_externo_key
    unique (cliente_slug, plataforma, anuncio_externo_id)
);

-- A leitura do painel e sempre "este cliente, estes ids de anuncio". O indice
-- unico acima ja serve o lookup; este serve a contagem por campanha.
create index if not exists lexia_anuncios_cliente_campanha_idx
  on public.lexia_anuncios (cliente_slug, campanha_externa_id);

-- ---------------------------------------------------------------------------
-- Permissoes: escrita so por service_role (rota de sincronizacao). O cliente
-- le apenas os seus anuncios, e so as colunas que o painel mostra.
-- ---------------------------------------------------------------------------
alter table public.lexia_anuncios enable row level security;

revoke all on public.lexia_anuncios
from public, anon, authenticated, service_role;

grant select, insert, update, delete on public.lexia_anuncios to service_role;

create policy "anuncios_select"
on public.lexia_anuncios for select to authenticated
using (public.lexia_user_can_access_cliente(cliente_slug));

grant select (
  id,
  cliente_slug,
  plataforma,
  anuncio_externo_id,
  nome,
  estado,
  conjunto_externo_id,
  conjunto_nome,
  campanha_externa_id,
  campanha_nome,
  sincronizado_em
) on public.lexia_anuncios to authenticated;

-- ---------------------------------------------------------------------------
-- O lado do contacto: sem este grant, o ecra de campanhas nao consegue contar.
-- ---------------------------------------------------------------------------
--
-- lexia_contactos tem grants coluna a coluna (ver as Fases 11 e 12), e
-- origem_source_id nunca foi concedido ao `authenticated` porque ate hoje
-- ninguem o lia pelo cliente autenticado -- a ficha le pela service_role. O
-- ecra de campanhas le pelo cliente autenticado de proposito (as policies sao
-- a defesa real do isolamento), e sem esta coluna a contagem por campanha
-- devolvia erro em vez de numeros.
--
-- Nao ha aqui dado novo exposto: e o id de um anuncio da conta do proprio
-- cliente, e a policy de lexia_contactos continua a decidir QUAIS as linhas.
grant select (origem_source_id) on public.lexia_contactos to authenticated;

comment on table public.lexia_anuncios is
  'Anuncios espelhados da plataforma, com o conjunto e a campanha a que pertencem. Dimensao: nao guarda numeros.';
comment on column public.lexia_anuncios.anuncio_externo_id is
  'ID do anuncio na plataforma. E este o valor que o referral da Meta grava em lexia_contactos.origem_source_id.';
comment on column public.lexia_anuncios.campanha_nome is
  'Nome da campanha no momento da sincronizacao. Desnormalizado de proposito: um anuncio apagado conserva o nome.';

commit;
