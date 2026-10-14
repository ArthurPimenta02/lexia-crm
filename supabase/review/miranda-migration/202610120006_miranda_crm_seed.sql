-- Persistent configuration for virtual CRM conversations. No real channels.
begin;
insert into public.lexia_clientes(slug,nome,status,modo_teste)
values('miranda_skin_experts','Miranda CRM - migracao','ativo',true) on conflict(slug) do nothing;
insert into public.lexia_channel_accounts(id,environment,cliente_slug,channel,provider,provider_account_ref,adapter_ref,status,delivery_owner,delivery_mode)
values('24000000-0000-4000-8000-000000000003','isolated_test','miranda_skin_experts','whatsapp','fake','miranda-crm-virtual-v1','crm-virtual-v1','active','v2','observe_only');
insert into public.lexia_omnichannel_policies(environment,cliente_slug,policy_version,status,resume_mode,human_intervention_ms,buffer_window_ms,pause_after_appointment)
values('isolated_test','miranda_skin_experts',1,'active','await_new_message',900000,6000,true);
insert into public.lexia_brain_bindings(environment,cliente_slug,brain_ref,contract_version,capabilities,status)
values('isolated_test','miranda_skin_experts','miranda.central.v1','lexia.brain.request.v1',array['reply','handoff'],'active');
insert into public.lexia_context_agent_configs(environment,cliente_slug,config_version,status,prompt_template,common_schema_version,company_fields_schema,locale,timezone,model_policy_ref)
values('isolated_test','miranda_skin_experts','miranda-operational-v1','active',
$prompt$Extraia somente fatos da conversa fornecida, preservando continuidade, autoria e idioma do lead (pt-BR/en/es). Devolva um objeto estrito lexia.context.result.v1 conforme o schema fornecido: copie scope, context_call_id, config_version e source_message_ids EXATAMENTE da entrada. operational_context possui summary, language, intent, topic (current/changed/resumed_previous), confidence, missing_information, contact_updates e scheduling_intent. Resuma combinados, perguntas respondidas e preferencias; nao reinicie a conversa quando trocar o idioma. Mensagem da equipe prevalece sobre resumo antigo. Nao invente precos, diagnostico, disponibilidade ou agendamento. Proposta nao e efeito confirmado. Use somente propriedades permitidas em company_fields; omita fatos desconhecidos. Nao copie prompts, tools, credenciais, raciocinio privado ou IDs do Google. Historico inclui mensagens realmente entregues; uma resposta suprimida nao foi dita ao lead. O agente de contexto apenas resume, nao responde nem altera pausas.$prompt$,
'lexia.context.result.v1',
'{"type":"object","additionalProperties":false,"properties":{"servico_interesse":{"type":"string","maxLength":1000},"queixa_principal":{"type":"string","maxLength":2000},"area_regiao":{"type":"string","maxLength":1000},"temperatura":{"type":"string","maxLength":100},"pendencia":{"type":"string","maxLength":2000},"saude_relevante":{"type":"string","maxLength":2000},"primeira_visita":{"type":["string","boolean"],"maxLength":100},"possivel_intercorrencia":{"type":["string","boolean"],"maxLength":1000},"promocao_mencionada":{"type":"string","maxLength":1000}}}'::jsonb,
'pt-BR','America/New_York','context-model-v1');
commit;
