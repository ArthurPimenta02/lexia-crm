-- Synthetic existing CRM conversation only. ALL changes are rolled back.
begin;
do $$
declare m public.lexia_agent_operational_memories%rowtype; s public.lexia_conversation_states%rowtype;
  proposed jsonb; call_id uuid; request jsonb; version integer;
begin
  select * into strict m from public.lexia_agent_operational_memories
    where scope_json->>'conversation_ref'='test:SYNTH-LEXIA-TEST-CHAT-270b3690-9593-43bd-9b11-13ab34fba3be';
  select * into strict s from public.lexia_conversation_states where id=m.conversation_id;
  perform public.lexia_omni_require(s.environment='isolated_test'
    and s.cliente_slug='miranda_skin_experts' and exists(select 1 from public.lexia_channel_accounts c where c.id=s.account_id and c.provider='fake'),'synthetic_memory_fixture_required');
  begin
    perform public.lexia_agent_memory_read(m.scope_json||jsonb_build_object('cliente_slug','empresa_sintetica_b'),m.last_invocation_id);
    raise exception 'cross_tenant_read_was_allowed';
  exception when no_data_found then null;end;
  begin
    perform public.lexia_agent_memory_read(m.scope_json||jsonb_build_object('conversation_ref','test:missing-fixture'),m.last_invocation_id);
    raise exception 'cross_conversation_read_was_allowed';
  exception when no_data_found then null;end;
  begin
    perform public.lexia_agent_memory_read(m.scope_json,extensions.gen_random_uuid());
    raise exception 'foreign_invocation_was_allowed';
  exception when invalid_parameter_value then if sqlerrm<>'memory_invocation_scope_mismatch' then raise;end if;end;

  call_id:=extensions.gen_random_uuid();
  insert into public.lexia_inbound_batches(conversation_id,environment,cliente_slug,fencing_token,cutoff_seq,status,invocation_id)
    values(s.id,s.environment,s.cliente_slug,s.fencing_counter+1,s.lead_message_seq,'claimed',call_id);
  request:=(m.last_request_identity::jsonb)||jsonb_build_object('invocation_id',call_id);
  proposed:=to_jsonb(m)||jsonb_build_object('version',m.version+1,'last_invocation_id',call_id,'last_request_identity',request::text,
    'cached_result',m.cached_result||jsonb_build_object('invocation_id',call_id));
  begin
    perform public.lexia_agent_memory_write(proposed,m.version-1);
    raise exception 'stale_cas_was_allowed';
  exception when invalid_parameter_value then if sqlerrm<>'memory_version_conflict' then raise;end if;end;
  begin
    perform public.lexia_agent_memory_write(jsonb_set(proposed,'{cached_result,captured_state,state_version}','999'::jsonb),m.version);
    raise exception 'foreign_state_was_allowed';
  exception when invalid_parameter_value then if sqlerrm<>'memory_result_origin_mismatch' then raise;end if;end;
  begin
    perform public.lexia_agent_memory_write(jsonb_set(proposed,'{context_json,password}','"synthetic-forbidden"'::jsonb),m.version);
    raise exception 'private_memory_field_was_allowed';
  exception when invalid_parameter_value then if sqlerrm<>'memory_nonoperational_field' then raise;end if;end;
  select x.version into strict version from public.lexia_agent_memory_write(proposed,m.version) x;
  perform public.lexia_omni_require(version=m.version+1,'cas_receipt_mismatch');
  select x.version into strict version from public.lexia_agent_memory_write(proposed,m.version) x;
  perform public.lexia_omni_require(version=m.version+1,'duplicate_memory_write_advanced_version');
end;
$$;
select '8 central memory regression assertions passed; transaction rolled back';
rollback;
