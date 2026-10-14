-- Virtual CRM only; never records a provider send. Called inside the final gate.
begin;
create function public.lexia_migration_record_virtual(p_action uuid)
returns table(out_mensagem_id uuid,out_duplicate boolean)
language plpgsql security definer set search_path='' as $$
declare a public.lexia_outbound_actions%rowtype;s public.lexia_conversation_states%rowtype;
  receipt record;
begin
  select * into strict a from public.lexia_outbound_actions where id=p_action;
  s:=public.lexia_omni_lock_conversation(a.conversation_id);
  select * into strict a from public.lexia_outbound_actions where id=p_action for update;
  perform public.lexia_omni_require(s.environment='isolated_test' and s.conversation_ref like 'test:%'
    and exists(select 1 from public.lexia_channel_accounts c where c.id=s.account_id and c.provider='fake' and c.status='active')
    and a.status in ('prepared','suppressed') and (a.status='prepared' or a.reason='virtual_delivered')
    and s.state_version=a.captured_state_version and s.delivery_epoch=a.captured_delivery_epoch
    and s.projection_status='current' and (a.lead_cutoff_seq is null or s.lead_message_seq=a.lead_cutoff_seq), 'virtual_message_gate_mismatch');
  perform public.lexia_omni_require(not exists(select 1 from public.lexia_conversation_blocks b where b.conversation_id=s.id
    and b.status='active' and (b.expires_at is null or b.expires_at>clock_timestamp())
    and not(b.block_type='appointment' and a.kind in ('appointment_reminder','appointment_confirmation') and b.source_ref=a.source_ref)),'virtual_message_blocked');
  select * into strict receipt from public.lexia_omni_record_message(s.id,'system','virtual:'||a.id::text,clock_timestamp(),
    case a.content->>'type' when 'text' then 'texto' when 'image' then 'imagem' else 'audio' end,
    coalesce(a.content->>'text',a.content->>'caption',a.content->>'media_ref'),a.content->>'type','completed',null);
  -- A second SQL command sees the row inserted by the RPC, unlike a sibling CTE.
  update public.lexia_mensagens set origem='teste_workflow' where id=receipt.out_mensagem_id and omni_conversation_id=s.id;
  return query select receipt.out_mensagem_id,receipt.out_duplicate;
end;
$$;
revoke all on function public.lexia_migration_record_virtual(uuid) from public,anon,authenticated;
grant execute on function public.lexia_migration_record_virtual(uuid) to service_role;
commit;
