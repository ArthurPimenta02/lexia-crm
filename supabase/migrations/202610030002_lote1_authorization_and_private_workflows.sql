begin;

do $$
declare
  constraint_columns smallint[];
  index_columns text;
  index_is_ready boolean;
  index_is_partial boolean;
  index_is_valid boolean;
  index_is_unique boolean;
  user_id_attnum smallint;
begin
  select attnum
    into user_id_attnum
  from pg_attribute
  where attrelid = 'public.lexia_usuarios_clientes'::regclass
    and attname = 'user_id'
    and not attisdropped;

  if user_id_attnum is null then
    raise exception 'Column user_id was not found on lexia_usuarios_clientes';
  end if;

  select conkey
    into constraint_columns
  from pg_constraint
  where conrelid = 'public.lexia_usuarios_clientes'::regclass
    and conname = 'lexia_usuarios_clientes_user_id_key'
    and contype = 'u';

  if constraint_columns is not null then
    if constraint_columns <> array[user_id_attnum]::smallint[] then
      raise exception
        'Existing profile constraint has an unexpected definition';
    end if;
  else
    if exists (
      select 1
      from pg_constraint
      where conrelid = 'public.lexia_usuarios_clientes'::regclass
        and conname = 'lexia_usuarios_clientes_user_id_key'
    ) then
      raise exception
        'A non-unique constraint already uses the expected profile name';
    end if;

    select
      indkey::text,
      indisready,
      indpred is not null,
      indisvalid,
      indisunique
      into
        index_columns,
        index_is_ready,
        index_is_partial,
        index_is_valid,
        index_is_unique
    from pg_index
    where indexrelid = to_regclass(
      'public.lexia_usuarios_clientes_user_id_key'
    );

    if not coalesce(index_is_ready, false)
      or not coalesce(index_is_valid, false)
      or not coalesce(index_is_unique, false)
      or coalesce(index_is_partial, true)
      or index_columns is distinct from user_id_attnum::text then
      raise exception
        'Valid unique profile index is required before applying Lot 1';
    end if;

    alter table public.lexia_usuarios_clientes
      add constraint lexia_usuarios_clientes_user_id_key
      unique using index lexia_usuarios_clientes_user_id_key;
  end if;
end;
$$;

alter table public.lexia_usuarios_clientes
  add constraint lexia_usuarios_clientes_role_scope_check
  check (
    (role = 'lexia_admin' and cliente_slug is null)
    or
    (role in ('cliente_admin', 'cliente_operador') and cliente_slug is not null)
  ) not valid;

alter table public.lexia_usuarios_clientes
  validate constraint lexia_usuarios_clientes_role_scope_check;

create table public.lexia_user_link_pendencias (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cliente_slug text not null references public.lexia_clientes(slug) on update cascade on delete cascade,
  role text not null check (role in ('cliente_admin', 'cliente_operador')),
  status_perfil text not null check (status_perfil in ('ativo', 'inativo')),
  estado text not null default 'pendente' check (estado in ('pendente', 'resolvida', 'descartada')),
  erro_codigo text,
  erro_resumo text not null,
  criado_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  resolvido_por uuid references auth.users(id) on delete set null,
  resolvido_em timestamptz
);

create unique index lexia_user_link_pendencias_user_pending_key
  on public.lexia_user_link_pendencias (user_id)
  where estado = 'pendente';

create index lexia_user_link_pendencias_cliente_idx
  on public.lexia_user_link_pendencias (cliente_slug, criado_em desc);

alter table public.lexia_user_link_pendencias enable row level security;
revoke all on public.lexia_user_link_pendencias from public, anon, authenticated;
grant select, insert, update on public.lexia_user_link_pendencias to service_role;

create or replace function public.lexia_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.lexia_usuarios_clientes u
    where u.user_id = auth.uid()
      and u.role = 'lexia_admin'
      and u.status = 'ativo'
      and u.cliente_slug is null
  );
$$;

create or replace function public.lexia_user_can_access_cliente(
  p_cliente_slug text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.lexia_is_admin()
    or exists (
      select 1
      from public.lexia_usuarios_clientes u
      join public.lexia_clientes c on c.slug = u.cliente_slug
      where u.user_id = auth.uid()
        and u.cliente_slug = p_cliente_slug
        and u.status = 'ativo'
        and u.role in ('cliente_admin', 'cliente_operador')
        and c.status = 'ativo'
    );
$$;

revoke all on function public.lexia_is_admin() from public, anon;
revoke all on function public.lexia_user_can_access_cliente(text) from public, anon;
grant execute on function public.lexia_is_admin() to authenticated, service_role;
grant execute on function public.lexia_user_can_access_cliente(text) to authenticated, service_role;

drop policy if exists "lexia_ai_sessoes_select" on public.lexia_ai_sessoes;
create policy "lexia_ai_sessoes_select"
on public.lexia_ai_sessoes for select to authenticated
using (
  criado_por = auth.uid()
  and public.lexia_user_can_access_cliente(cliente_slug)
);

drop policy if exists "lexia_ai_sessoes_insert" on public.lexia_ai_sessoes;
create policy "lexia_ai_sessoes_insert"
on public.lexia_ai_sessoes for insert to authenticated
with check (
  criado_por = auth.uid()
  and public.lexia_user_can_access_cliente(cliente_slug)
);

drop policy if exists "lexia_ai_sessoes_update" on public.lexia_ai_sessoes;
create policy "lexia_ai_sessoes_update"
on public.lexia_ai_sessoes for update to authenticated
using (
  criado_por = auth.uid()
  and public.lexia_user_can_access_cliente(cliente_slug)
)
with check (
  criado_por = auth.uid()
  and public.lexia_user_can_access_cliente(cliente_slug)
);

drop policy if exists "lexia_ai_sessoes_delete" on public.lexia_ai_sessoes;
create policy "lexia_ai_sessoes_delete"
on public.lexia_ai_sessoes for delete to authenticated
using (
  criado_por = auth.uid()
  and public.lexia_user_can_access_cliente(cliente_slug)
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
      and sessao.cliente_slug = lexia_ai_mensagens.cliente_slug
      and public.lexia_user_can_access_cliente(sessao.cliente_slug)
  )
);

drop policy if exists "lexia_ai_mensagens_insert" on public.lexia_ai_mensagens;
create policy "lexia_ai_mensagens_insert"
on public.lexia_ai_mensagens for insert to authenticated
with check (
  papel = 'usuario'
  and criado_por = auth.uid()
  and exists (
    select 1
    from public.lexia_ai_sessoes sessao
    where sessao.id = lexia_ai_mensagens.sessao_id
      and sessao.criado_por = auth.uid()
      and sessao.cliente_slug = lexia_ai_mensagens.cliente_slug
      and public.lexia_user_can_access_cliente(sessao.cliente_slug)
  )
);

drop policy if exists "lexia_ai_insights_select" on public.lexia_conversation_insights;
create policy "lexia_ai_insights_select"
on public.lexia_conversation_insights for select to authenticated
using (public.lexia_user_can_access_cliente(cliente_slug));

drop policy if exists "lexia_ai_execucoes_select" on public.lexia_ai_execucoes;
create policy "lexia_ai_execucoes_select"
on public.lexia_ai_execucoes for select to authenticated
using (
  criado_por = auth.uid()
  and public.lexia_user_can_access_cliente(cliente_slug)
);

drop policy if exists "Cliente pode ler ajustes do próprio cliente"
  on public.lexia_ajustes_agente;
create policy "Cliente pode ler ajustes do próprio cliente"
on public.lexia_ajustes_agente for select to authenticated
using (
  exists (
    select 1
    from public.lexia_usuarios_clientes u
    join public.lexia_clientes c on c.slug = u.cliente_slug
    where u.user_id = auth.uid()
      and u.cliente_slug = lexia_ajustes_agente.cliente_slug
      and u.status = 'ativo'
      and u.role in ('cliente_admin', 'cliente_operador')
      and c.status = 'ativo'
  )
);

create or replace function public.lexia_reivindicar_ferramenta_analista(
  p_execucao_id uuid,
  p_ferramenta text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed_id uuid;
begin
  if nullif(trim(coalesce(p_ferramenta, '')), '') is null then
    return false;
  end if;

  update public.lexia_ai_execucoes
  set ferramentas = case
    when coalesce(ferramentas, '[]'::jsonb) @> jsonb_build_array(p_ferramenta)
      then coalesce(ferramentas, '[]'::jsonb)
    else coalesce(ferramentas, '[]'::jsonb) || jsonb_build_array(p_ferramenta)
  end
  where id = p_execucao_id
    and tipo = 'chat'
    and status = 'iniciada'
  returning id into claimed_id;

  return claimed_id is not null;
end;
$$;

revoke all on function public.lexia_reivindicar_ferramenta_analista(uuid, text)
  from public, anon, authenticated;
grant execute on function public.lexia_reivindicar_ferramenta_analista(uuid, text)
  to service_role;

create or replace function public.lexia_finalizar_execucao_analista(
  p_execucao_id uuid,
  p_status text,
  p_resposta_id uuid default null,
  p_resposta text default null,
  p_fontes jsonb default '[]'::jsonb,
  p_ferramentas jsonb default '[]'::jsonb,
  p_modelo text default null,
  p_versao_prompt text default null,
  p_tokens_entrada integer default null,
  p_tokens_saida integer default null,
  p_duracao_ms integer default null,
  p_erro text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  execution_row public.lexia_ai_execucoes%rowtype;
  message_row public.lexia_ai_mensagens%rowtype;
  finished_at timestamptz := clock_timestamp();
begin
  if p_status not in ('concluida', 'erro') then
    return 'invalida';
  end if;

  select *
    into execution_row
  from public.lexia_ai_execucoes
  where id = p_execucao_id
  for update;

  if not found then
    return 'nao_encontrada';
  end if;

  if execution_row.tipo <> 'chat'
    or execution_row.sessao_id is null
    or execution_row.criado_por is null
    or not exists (
      select 1
      from public.lexia_ai_sessoes s
      where s.id = execution_row.sessao_id
        and s.cliente_slug = execution_row.cliente_slug
        and s.criado_por = execution_row.criado_por
    ) then
    return 'invalida';
  end if;

  if execution_row.status <> 'iniciada' then
    if execution_row.status <> p_status then
      return 'conflito';
    end if;

    if p_status = 'erro' then
      if execution_row.erro is distinct from left(coalesce(p_erro, ''), 500) then
        return 'conflito';
      end if;
      return 'repetida';
    end if;

    if p_resposta_id is null or nullif(trim(coalesce(p_resposta, '')), '') is null then
      return 'conflito';
    end if;

    select *
      into message_row
    from public.lexia_ai_mensagens
    where id = p_resposta_id;

    if not found
      or message_row.sessao_id <> execution_row.sessao_id
      or message_row.cliente_slug <> execution_row.cliente_slug
      or message_row.criado_por is distinct from execution_row.criado_por
      or message_row.papel <> 'assistente'
      or message_row.conteudo <> p_resposta
      or message_row.metadata ->> 'execucao_id' <> p_execucao_id::text then
      return 'conflito';
    end if;

    return 'repetida';
  end if;

  if p_status = 'erro' then
    update public.lexia_ai_execucoes
    set
      concluido_em = finished_at,
      duracao_ms = greatest(0, p_duracao_ms),
      erro = left(coalesce(p_erro, ''), 500),
      status = 'erro'
    where id = p_execucao_id;
  else
    if p_resposta_id is null
      or nullif(trim(coalesce(p_resposta, '')), '') is null
      or jsonb_typeof(coalesce(p_fontes, '[]'::jsonb)) <> 'array'
      or jsonb_typeof(coalesce(p_ferramentas, '[]'::jsonb)) <> 'array' then
      return 'invalida';
    end if;

    select *
      into message_row
    from public.lexia_ai_mensagens
    where id = p_resposta_id;

    if found then
      if message_row.sessao_id <> execution_row.sessao_id
        or message_row.cliente_slug <> execution_row.cliente_slug
        or message_row.criado_por is distinct from execution_row.criado_por
        or message_row.papel <> 'assistente'
        or message_row.conteudo <> p_resposta
        or message_row.metadata ->> 'execucao_id' <> p_execucao_id::text then
        return 'conflito';
      end if;
    else
      insert into public.lexia_ai_mensagens (
        id,
        sessao_id,
        cliente_slug,
        criado_por,
        papel,
        conteudo,
        fontes,
        metadata
      ) values (
        p_resposta_id,
        execution_row.sessao_id,
        execution_row.cliente_slug,
        execution_row.criado_por,
        'assistente',
        p_resposta,
        coalesce(p_fontes, '[]'::jsonb),
        jsonb_build_object(
          'execucao_id', p_execucao_id,
          'ferramentas', coalesce(p_ferramentas, '[]'::jsonb),
          'modelo', coalesce(p_modelo, 'n8n'),
          'orquestrador', 'n8n',
          'versao_prompt', coalesce(p_versao_prompt, 'lexia_n8n_analyst_v1')
        )
      );
    end if;

    update public.lexia_ai_execucoes
    set
      concluido_em = finished_at,
      duracao_ms = greatest(0, p_duracao_ms),
      erro = null,
      ferramentas = coalesce(p_ferramentas, '[]'::jsonb),
      fontes = coalesce(p_fontes, '[]'::jsonb),
      modelo = left(coalesce(p_modelo, 'n8n'), 120),
      status = 'concluida',
      tokens_entrada = p_tokens_entrada,
      tokens_saida = p_tokens_saida,
      versao_prompt = left(
        coalesce(p_versao_prompt, 'lexia_n8n_analyst_v1'),
        120
      )
    where id = p_execucao_id;
  end if;

  update public.lexia_ai_sessoes
  set atualizado_em = finished_at
  where id = execution_row.sessao_id
    and cliente_slug = execution_row.cliente_slug
    and criado_por = execution_row.criado_por;

  return 'finalizada';
end;
$$;

revoke all on function public.lexia_finalizar_execucao_analista(
  uuid,
  text,
  uuid,
  text,
  jsonb,
  jsonb,
  text,
  text,
  integer,
  integer,
  integer,
  text
) from public, anon, authenticated;

grant execute on function public.lexia_finalizar_execucao_analista(
  uuid,
  text,
  uuid,
  text,
  jsonb,
  jsonb,
  text,
  text,
  integer,
  integer,
  integer,
  text
) to service_role;

commit;
