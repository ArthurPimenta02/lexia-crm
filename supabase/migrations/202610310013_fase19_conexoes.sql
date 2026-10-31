-- Fase 19: conexões de cada agente (WhatsApp, Meta, agenda, Redis, bases).
--
-- O PROBLEMA QUE RESOLVE
-- No n8n, os tokens de cada cliente estão escritos dentro dos nós ("Config
-- Cliente Lexia") e nas credenciais do n8n. O agente em código precisa deles
-- noutro sítio, e o Arthur precisa de os poder trocar sem passar pelo chat
-- nem mexer em código. Esta tabela é esse sítio; a tela é /admin/conexoes.
--
-- PORQUE CIFRADO
-- `segredos` guarda os tokens cifrados com AES-256-GCM. A chave de cifra NÃO
-- está na base: vive na variável LEXIA_CONEXOES_CHAVE, na Vercel e na VPS do
-- agente. Quem tiver só a base (painel do Supabase, backup, export) vê texto
-- cifrado. `finais` guarda os 4 últimos caracteres de cada segredo, para a
-- tela dizer "termina em …a1b2" sem nunca devolver o valor.
--
-- PORQUE FECHADA
-- RLS ligado, nenhuma policy, grants só para a service_role. Nem o cliente
-- autenticado nem o anon leem uma linha.
--
-- cliente_slug NULO = conexão da Lexia, partilhada por todos (a conta Google
-- onde os clientes partilham a agenda; chaves de IA de reserva).
--
-- Esta migration é aditiva: cria uma tabela nova e não toca em nada existente.

begin;

do $$
begin
  if to_regclass('public.lexia_clientes') is null then
    raise exception
      'lexia_clientes nao existe nesta base. Esta migration pertence ao Supabase CENTRAL da Lexia, nao ao projecto de um cliente.';
  end if;
end;
$$;

create table if not exists public.lexia_conexoes (
  id uuid primary key default extensions.gen_random_uuid(),
  cliente_slug text references public.lexia_clientes(slug)
    on update cascade on delete restrict,
  -- O catálogo de tipos vive no código (lib/conexoes/tipos.ts); aqui só se
  -- garante a forma, para um tipo novo não precisar de migration.
  tipo text not null check (tipo ~ '^[a-z][a-z0-9_]{1,40}$'),
  campos jsonb not null default '{}'::jsonb,
  segredos text,
  finais jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  constraint lexia_conexoes_cliente_tipo_key
    unique nulls not distinct (cliente_slug, tipo)
);

alter table public.lexia_conexoes enable row level security;

revoke all on public.lexia_conexoes from anon, authenticated;
grant select, insert, update, delete on public.lexia_conexoes to service_role;

commit;
