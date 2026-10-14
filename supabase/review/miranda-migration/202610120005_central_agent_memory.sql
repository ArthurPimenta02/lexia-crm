-- Operational memory only. No catalog, private prompts or provider tool state.
begin;
create table public.lexia_agent_operational_memories (
  conversation_id uuid primary key references public.lexia_conversation_states(id),
  memory_key text not null unique,
  scope_json jsonb not null,
  context_json jsonb not null check(jsonb_typeof(context_json)='object' and octet_length(context_json::text)<=40000),
  version integer not null check(version>0),
  last_invocation_id uuid not null,
  last_request_identity text not null check(length(last_request_identity)<=150000),
  cached_result jsonb not null check(jsonb_typeof(cached_result)='object' and octet_length(cached_result::text)<=150000),
  updated_at timestamptz not null
);
alter table public.lexia_agent_operational_memories enable row level security;
revoke all on public.lexia_agent_operational_memories from public,anon,authenticated;

create function public.lexia_agent_memory_scope(p_scope jsonb,p_invocation uuid)
returns public.lexia_conversation_states language plpgsql security definer set search_path='' as $$
declare s public.lexia_conversation_states%rowtype;
begin
  select * into strict s from public.lexia_conversation_states where
    environment=p_scope->>'environment' and cliente_slug=p_scope->>'cliente_slug'
    and channel=p_scope->>'channel' and account_id=(p_scope->>'account_ref')::uuid
    and conversation_ref=p_scope->>'conversation_ref';
  s:=public.lexia_omni_lock_conversation(s.id);
  perform public.lexia_omni_require(exists(select 1 from public.lexia_channel_accounts a where a.id=s.account_id
    and a.status='active' and a.cliente_slug=s.cliente_slug and a.environment=s.environment),'memory_account_unavailable');
  perform public.lexia_omni_require(exists(select 1 from public.lexia_inbound_batches b
    where b.conversation_id=s.id and b.status in ('claimed','completed')
      and (b.invocation_id=p_invocation or (b.id=p_invocation and b.invocation_id is null and b.status='claimed'))),'memory_invocation_scope_mismatch');
  -- The original omnichannel uses the claimed batch UUID as invocation UUID.
  -- Bind it once before models/tools, never adopt an arbitrary caller UUID.
  update public.lexia_inbound_batches set invocation_id=p_invocation
    where id=p_invocation and conversation_id=s.id and status='claimed' and invocation_id is null;
  return s;
end;
$$;
create function public.lexia_agent_memory_read(p_scope jsonb,p_invocation uuid)
returns setof public.lexia_agent_operational_memories language plpgsql security definer set search_path='' as $$
declare s public.lexia_conversation_states%rowtype;
begin
  s:=public.lexia_agent_memory_scope(p_scope,p_invocation);
  return query select * from public.lexia_agent_operational_memories where conversation_id=s.id;
end;
$$;
create function public.lexia_agent_memory_write(p_memory jsonb,p_expected integer)
returns setof public.lexia_agent_operational_memories language plpgsql security definer set search_path='' as $$
declare s public.lexia_conversation_states%rowtype; old public.lexia_agent_operational_memories%rowtype;
  result jsonb; context jsonb; request jsonb;
begin
  s:=public.lexia_agent_memory_scope(p_memory->'scope_json',(p_memory->>'last_invocation_id')::uuid);
  -- JSON serialization in JS is compact; reconstruct with jsonb equality instead of stripping string whitespace.
  perform public.lexia_omni_require((p_memory->>'memory_key')::jsonb=jsonb_build_array(s.environment,s.cliente_slug,s.channel,s.account_id::text,s.conversation_ref),'memory_key_scope_mismatch');
  result:=p_memory->'cached_result';context:=p_memory->'context_json';request:=(p_memory->>'last_request_identity')::jsonb;
  perform public.lexia_omni_require(result->'scope'=p_memory->'scope_json'
    and result->>'invocation_id'=p_memory->>'last_invocation_id'
    and result->'captured_state'=request->'captured_state'
    and request->'scope'=result->'scope' and request->>'invocation_id'=result->>'invocation_id','memory_result_origin_mismatch');
  perform public.lexia_omni_require(not exists(select 1 from jsonb_object_keys(context) k
    where k not in ('idioma','apresentacao_ja_enviada','perguntas_feitas','queixa_principal','area_regiao','servico_interesse','temperatura','pendencia','agendamento','ultimo_agendamento','origem_anuncio','saude_relevante','primeira_visita','possivel_intercorrencia','promocao_mencionada')),'memory_nonoperational_field');
  perform public.lexia_omni_require((context::text||result::text) !~* '"(password|senha|token|secret|service_role|credentials?|prompt|system_prompt|raciocinio|reasoning|tool_state|raw_response|provider_event_id|calendar_id|google_event_id)"\s*:','memory_private_data_forbidden');
  select * into old from public.lexia_agent_operational_memories where conversation_id=s.id for update;
  if found and old.last_invocation_id=(p_memory->>'last_invocation_id')::uuid then
    perform public.lexia_omni_require(old.last_request_identity=p_memory->>'last_request_identity'
      and old.cached_result=result and old.context_json=context,'memory_retry_conflict');
    return next old;return;
  end if;
  perform public.lexia_omni_require(coalesce(old.version,0)=p_expected and (p_memory->>'version')::integer=p_expected+1,'memory_version_conflict');
  insert into public.lexia_agent_operational_memories values(s.id,p_memory->>'memory_key',p_memory->'scope_json',context,
    p_expected+1,(p_memory->>'last_invocation_id')::uuid,p_memory->>'last_request_identity',result,(p_memory->>'updated_at')::timestamptz)
  on conflict(conversation_id) do update set context_json=excluded.context_json,version=excluded.version,
    last_invocation_id=excluded.last_invocation_id,last_request_identity=excluded.last_request_identity,
    cached_result=excluded.cached_result,updated_at=excluded.updated_at;
  return query select * from public.lexia_agent_operational_memories where conversation_id=s.id;
end;
$$;
revoke all on function public.lexia_agent_memory_scope(jsonb,uuid),public.lexia_agent_memory_read(jsonb,uuid),public.lexia_agent_memory_write(jsonb,integer) from public,anon,authenticated;
grant execute on function public.lexia_agent_memory_read(jsonb,uuid),public.lexia_agent_memory_write(jsonb,integer) to service_role;
commit;
