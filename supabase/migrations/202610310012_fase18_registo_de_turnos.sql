-- Fase 18: registo de cada turno do agente em código.
--
-- O PROBLEMA QUE RESOLVE
-- No n8n, para saber porque é que a agente respondeu X, abre-se a execução e
-- vê-se nó a nó. O agente em código (repo lexia-agente, na VPS) não tem essa
-- tela: sem isto, a única forma de investigar uma queixa do cliente é pedir a
-- quem tem acesso à VPS. E o n8n apaga as execuções ao fim de alguns dias.
--
-- O QUE CADA LINHA GUARDA (um turno = uma resposta da agente, ou a decisão
-- de não responder)
-- - o que chegou e o que saiu (mensagem do cliente, balões enviados, handoff);
-- - um resumo legível (assunto, idioma, briefing, texto do Redator, travas);
-- - cada chamada de IA e cada ferramenta, com o que entrou e saiu;
-- - a saída de cada passo, por ordem, compactada (o histórico da conversa não
--   é repetido: já está em lexia_mensagens);
-- - custo e tokens.
--
-- PORQUE FECHADA AO CLIENTE AUTENTICADO
-- Os passos trazem prompts internos, regras de preço e dados da conversa. É
-- uma ferramenta de diagnóstico da Lexia: RLS ligado, nenhuma policy, grants
-- só para a service_role. A tela em /admin/turnos lê do lado do servidor.
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

create table if not exists public.lexia_turnos (
  id uuid primary key default extensions.gen_random_uuid(),
  cliente_slug text not null references public.lexia_clientes(slug)
    on update cascade on delete restrict,
  -- De quem é o agente que correu (num teste, cliente_slug é o do painel de
  -- testes e agente é o cliente cuja inteligência foi usada).
  agente text not null check (char_length(agente) between 1 and 80),
  -- teste: Área de testes. sombra: mensagem real, resposta gerada e NÃO
  -- enviada (comparação com o n8n). producao: enviada ao cliente.
  modo text not null check (modo in ('teste', 'sombra', 'producao')),
  run_id text,
  identificador_conversa text,
  canal text,
  estado text not null
    check (estado in ('respondido', 'parado', 'juntado_a_outra', 'erro')),
  motivo text,
  erro text,
  mensagem_cliente text,
  mensagens jsonb,
  rota text,
  handoff jsonb,
  resumo jsonb,
  ia jsonb,
  ferramentas jsonb,
  passos jsonb,
  custo_usd numeric(12, 6),
  custo_sem_preco jsonb,
  tokens jsonb,
  duracao_ms integer,
  versao text,
  iniciado_em timestamptz,
  criado_em timestamptz not null default now()
);

create index if not exists lexia_turnos_cliente_criado_idx
  on public.lexia_turnos (cliente_slug, criado_em desc);
create index if not exists lexia_turnos_conversa_criado_idx
  on public.lexia_turnos (identificador_conversa, criado_em desc);
create index if not exists lexia_turnos_run_idx
  on public.lexia_turnos (run_id);

alter table public.lexia_turnos enable row level security;

revoke all on public.lexia_turnos from anon, authenticated;
grant select, insert, delete on public.lexia_turnos to service_role;

commit;
