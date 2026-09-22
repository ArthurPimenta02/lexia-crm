begin;

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.lexia_ai_sessoes (
  id uuid primary key default extensions.gen_random_uuid(),
  cliente_slug text not null references public.lexia_clientes(slug) on update cascade on delete cascade,
  criado_por uuid not null references auth.users(id) on delete cascade,
  titulo text,
  status text not null default 'ativa' check (status in ('ativa', 'arquivada')),
  contexto jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.lexia_ai_mensagens (
  id uuid primary key default extensions.gen_random_uuid(),
  sessao_id uuid not null references public.lexia_ai_sessoes(id) on delete cascade,
  cliente_slug text not null references public.lexia_clientes(slug) on update cascade on delete cascade,
  criado_por uuid references auth.users(id) on delete set null,
  papel text not null check (papel in ('usuario', 'assistente')),
  conteudo text not null,
  fontes jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now()
);

create table if not exists public.lexia_conversation_insights (
  id uuid primary key default extensions.gen_random_uuid(),
  cliente_slug text not null references public.lexia_clientes(slug) on update cascade on delete cascade,
  identificador_conversa text not null,
  canal text,
  primeira_mensagem_em timestamptz,
  ultima_mensagem_em timestamptz,
  analisado_ate timestamptz,
  quantidade_mensagens integer not null default 0,
  hash_fonte text not null,
  resumo text not null default '',
  intencao text not null default '',
  etapa_comercial text not null default 'desconhecida',
  sentimento text not null default 'neutro',
  resultado text not null default 'desconhecido',
  objecoes jsonb not null default '[]'::jsonb,
  pontos_fortes jsonb not null default '[]'::jsonb,
  oportunidades jsonb not null default '[]'::jsonb,
  evidencias jsonb not null default '[]'::jsonb,
  confianca numeric(4,3) not null default 0 check (confianca >= 0 and confianca <= 1),
  modelo text not null,
  versao_prompt text not null,
  analisado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (cliente_slug, identificador_conversa)
);

create table if not exists public.lexia_ai_execucoes (
  id uuid primary key default extensions.gen_random_uuid(),
  sessao_id uuid references public.lexia_ai_sessoes(id) on delete set null,
  cliente_slug text not null references public.lexia_clientes(slug) on update cascade on delete cascade,
  criado_por uuid references auth.users(id) on delete set null,
  tipo text not null default 'chat' check (tipo in ('chat', 'classificacao')),
  status text not null default 'iniciada' check (status in ('iniciada', 'concluida', 'erro')),
  pergunta text,
  periodo_inicio timestamptz,
  periodo_fim timestamptz,
  canal text,
  ferramentas jsonb not null default '[]'::jsonb,
  fontes jsonb not null default '[]'::jsonb,
  modelo text,
  versao_prompt text,
  tokens_entrada integer,
  tokens_saida integer,
  duracao_ms integer,
  erro text,
  criado_em timestamptz not null default now(),
  concluido_em timestamptz
);

create index if not exists lexia_ai_sessoes_usuario_idx
  on public.lexia_ai_sessoes (criado_por, atualizado_em desc);
create index if not exists lexia_ai_sessoes_cliente_idx
  on public.lexia_ai_sessoes (cliente_slug, atualizado_em desc);
create index if not exists lexia_ai_mensagens_sessao_idx
  on public.lexia_ai_mensagens (sessao_id, criado_em asc);
create index if not exists lexia_ai_insights_periodo_idx
  on public.lexia_conversation_insights (cliente_slug, primeira_mensagem_em desc);
create index if not exists lexia_ai_insights_canal_idx
  on public.lexia_conversation_insights (cliente_slug, canal, primeira_mensagem_em desc);
create index if not exists lexia_ai_execucoes_rate_limit_idx
  on public.lexia_ai_execucoes (criado_por, criado_em desc);

create or replace function public.lexia_ai_touch_atualizado_em()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

drop trigger if exists lexia_ai_sessoes_touch on public.lexia_ai_sessoes;
create trigger lexia_ai_sessoes_touch
before update on public.lexia_ai_sessoes
for each row execute function public.lexia_ai_touch_atualizado_em();

drop trigger if exists lexia_ai_insights_touch on public.lexia_conversation_insights;
create trigger lexia_ai_insights_touch
before update on public.lexia_conversation_insights
for each row execute function public.lexia_ai_touch_atualizado_em();

alter table public.lexia_ai_sessoes enable row level security;
alter table public.lexia_ai_mensagens enable row level security;
alter table public.lexia_conversation_insights enable row level security;
alter table public.lexia_ai_execucoes enable row level security;

drop policy if exists "lexia_ai_sessoes_select" on public.lexia_ai_sessoes;
create policy "lexia_ai_sessoes_select"
on public.lexia_ai_sessoes for select to authenticated
using (
  criado_por = auth.uid()
  and exists (
    select 1
    from public.lexia_usuarios_clientes perfil
    where perfil.user_id = auth.uid()
      and perfil.status = 'ativo'
      and (perfil.role = 'lexia_admin' or perfil.cliente_slug = lexia_ai_sessoes.cliente_slug)
  )
);

drop policy if exists "lexia_ai_sessoes_insert" on public.lexia_ai_sessoes;
create policy "lexia_ai_sessoes_insert"
on public.lexia_ai_sessoes for insert to authenticated
with check (
  criado_por = auth.uid()
  and exists (
    select 1
    from public.lexia_usuarios_clientes perfil
    where perfil.user_id = auth.uid()
      and perfil.status = 'ativo'
      and (perfil.role = 'lexia_admin' or perfil.cliente_slug = lexia_ai_sessoes.cliente_slug)
  )
);

drop policy if exists "lexia_ai_sessoes_update" on public.lexia_ai_sessoes;
create policy "lexia_ai_sessoes_update"
on public.lexia_ai_sessoes for update to authenticated
using (
  criado_por = auth.uid()
  and exists (
    select 1
    from public.lexia_usuarios_clientes perfil
    where perfil.user_id = auth.uid()
      and perfil.status = 'ativo'
      and (perfil.role = 'lexia_admin' or perfil.cliente_slug = lexia_ai_sessoes.cliente_slug)
  )
)
with check (
  criado_por = auth.uid()
  and exists (
    select 1
    from public.lexia_usuarios_clientes perfil
    where perfil.user_id = auth.uid()
      and perfil.status = 'ativo'
      and (perfil.role = 'lexia_admin' or perfil.cliente_slug = lexia_ai_sessoes.cliente_slug)
  )
);

drop policy if exists "lexia_ai_sessoes_delete" on public.lexia_ai_sessoes;
create policy "lexia_ai_sessoes_delete"
on public.lexia_ai_sessoes for delete to authenticated
using (
  criado_por = auth.uid()
  and exists (
    select 1
    from public.lexia_usuarios_clientes perfil
    where perfil.user_id = auth.uid()
      and perfil.status = 'ativo'
      and (perfil.role = 'lexia_admin' or perfil.cliente_slug = lexia_ai_sessoes.cliente_slug)
  )
);

drop policy if exists "lexia_ai_mensagens_select" on public.lexia_ai_mensagens;
create policy "lexia_ai_mensagens_select"
on public.lexia_ai_mensagens for select to authenticated
using (
  exists (
    select 1
    from public.lexia_ai_sessoes sessao
    where sessao.id = lexia_ai_mensagens.sessao_id
      and sessao.criado_por = auth.uid()
      and exists (
        select 1
        from public.lexia_usuarios_clientes perfil
        where perfil.user_id = auth.uid()
          and perfil.status = 'ativo'
          and (perfil.role = 'lexia_admin' or perfil.cliente_slug = sessao.cliente_slug)
      )
  )
);

drop policy if exists "lexia_ai_mensagens_insert" on public.lexia_ai_mensagens;
create policy "lexia_ai_mensagens_insert"
on public.lexia_ai_mensagens for insert to authenticated
with check (
  criado_por = auth.uid()
  and exists (
    select 1
    from public.lexia_ai_sessoes sessao
    where sessao.id = lexia_ai_mensagens.sessao_id
      and sessao.criado_por = auth.uid()
      and sessao.cliente_slug = lexia_ai_mensagens.cliente_slug
      and exists (
        select 1
        from public.lexia_usuarios_clientes perfil
        where perfil.user_id = auth.uid()
          and perfil.status = 'ativo'
          and (perfil.role = 'lexia_admin' or perfil.cliente_slug = sessao.cliente_slug)
      )
  )
);

drop policy if exists "lexia_ai_insights_select" on public.lexia_conversation_insights;
create policy "lexia_ai_insights_select"
on public.lexia_conversation_insights for select to authenticated
using (
  exists (
    select 1
    from public.lexia_usuarios_clientes perfil
    where perfil.user_id = auth.uid()
      and perfil.status = 'ativo'
      and (perfil.role = 'lexia_admin' or perfil.cliente_slug = lexia_conversation_insights.cliente_slug)
  )
);

drop policy if exists "lexia_ai_execucoes_select" on public.lexia_ai_execucoes;
create policy "lexia_ai_execucoes_select"
on public.lexia_ai_execucoes for select to authenticated
using (
  criado_por = auth.uid()
  and exists (
    select 1
    from public.lexia_usuarios_clientes perfil
    where perfil.user_id = auth.uid()
      and perfil.status = 'ativo'
      and (perfil.role = 'lexia_admin' or perfil.cliente_slug = lexia_ai_execucoes.cliente_slug)
  )
);

revoke all on public.lexia_ai_sessoes from anon, authenticated;
revoke all on public.lexia_ai_mensagens from anon, authenticated;
revoke all on public.lexia_conversation_insights from anon, authenticated;
revoke all on public.lexia_ai_execucoes from anon, authenticated;

grant select, insert, update, delete on public.lexia_ai_sessoes to authenticated;
grant select, insert on public.lexia_ai_mensagens to authenticated;
grant select on public.lexia_conversation_insights to authenticated;
grant select on public.lexia_ai_execucoes to authenticated;

commit;
