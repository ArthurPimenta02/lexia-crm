-- Analista Lexia: "consulta livre" (19/11).
--
-- O modelo escreve UM SELECT sobre os dados da empresa da sessão e recebe o
-- resultado. A empresa NUNCA vem do modelo: o servidor passa p_cliente a partir
-- da sessão. A segurança está em camadas, e cada uma sozinha já trava a fuga:
--
--   1. PAPEL: a consulta corre como `analista_leitor` (NOLOGIN, sem privilégios
--      a não ser SELECT nas vistas do schema `analista`). As tabelas `public.*`
--      (lexia_conexoes, utilizadores, aparelhos, ...) ficam sem permissão,
--      mesmo que o texto chegue lá por um caminho que o filtro não previu.
--   2. VISTAS: cada vista filtra `cliente_slug = current_setting('analista.cliente')`
--      e é `security_barrier` (nenhuma condição do modelo corre antes do filtro
--      da empresa, por isso um erro de conversão não mostra linhas de outra).
--      Só colunas úteis; nada de uuids de utilizadores, chaves, ids do Google,
--      prompts internos ou custos de IA.
--   3. FILTRO DE TEXTO: uma só instrução SELECT/WITH; sem ';', comentários,
--      aspas duplas, '$', '\', U&; sem palavras de escrita/DDL; sem `schema.`
--      de outro schema; sem pg_*, information_schema, set_config,
--      current_setting, *_to_xml, ts_stat, dblink, lo_*, FOR UPDATE/SHARE, SELECT INTO.
--   4. TRANSACÇÃO SÓ DE LEITURA (transaction_read_only = on) e, depois de
--      correr, confere que `analista.cliente` não mudou (senão deita fora).
--   5. CUSTO: EXPLAIN antes de correr; acima de 5 000 000 de custo estimado
--      recusa. Tempo: `statement_timeout = 8s` declarado na função pública,
--      que o PostgREST (db-hoisted-tx-settings, v12+) aplica à transacção do
--      pedido. (Um `set local` dentro da função não trava a instrução que já
--      está a correr; por isso o limite vive na declaração e no EXPLAIN.)
--   6. Devolve no máximo 200 linhas em JSON, com o total.
--
-- Entrada pela API: public.analista_consultar(p_cliente, p_sql), só service_role.
-- (Fica em `public` porque é o schema que o PostgREST expõe; o trabalho é
-- feito por analista.consultar, que é SECURITY DEFINER do papel analista_leitor.)

-- ---------------------------------------------------------------- papel
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'analista_leitor') then
    create role analista_leitor nologin noinherit;
  end if;
end $$;
-- Quem corre a migração precisa de poder passar objectos para o papel (PG16+).
grant analista_leitor to current_user;

create schema if not exists analista;
revoke all on schema analista from public, anon, authenticated;
grant usage on schema analista to analista_leitor, service_role;

-- ---------------------------------------------------------------- vistas
-- Fichas dos clientes (sem as fundidas noutra ficha).
create or replace view analista.contactos with (security_barrier = true) as
select id, nome, telefone, telefone_digitos, email, canal, identificador_conversa,
       criado_em, atualizado_em, origem_tipo, origem_source_id as anuncio_externo_id,
       origem_titulo, origem_dados ->> 'campanha_externa_id' as campanha_externa_id,
       origem_manual, origem_manual_nota, notas, morada, viatura, idade
from public.lexia_contactos
where cliente_slug = current_setting('analista.cliente', true) and fundido_em is null;

create or replace view analista.mensagens with (security_barrier = true) as
select id, contacto_id, identificador_conversa, direccao, tipo, conteudo, origem, criado_em
from public.lexia_mensagens
where cliente_slug = current_setting('analista.cliente', true);

create or replace view analista.agendamentos with (security_barrier = true) as
select id, inicio, fim, dia_inteiro, fuso, titulo, descricao, localizacao, estado,
       nome_cliente, telefone, telefone_digitos, email, origem, executor, servico,
       valor_previsto, referencia_cliente as contacto_id, dados, criado_no_google, criado_em
from public.lexia_agendamentos
where cliente_slug = current_setting('analista.cliente', true);

create or replace view analista.eventos with (security_barrier = true) as
select id, tipo, ocorrido_em, identificador_conversa, telefone_digitos, origem, dados
from public.lexia_eventos
where cliente_slug = current_setting('analista.cliente', true);

create or replace view analista.anuncios with (security_barrier = true) as
select anuncio_externo_id, nome, estado, plataforma, conjunto_externo_id, conjunto_nome,
       campanha_externa_id, campanha_nome, sincronizado_em
from public.lexia_anuncios
where cliente_slug = current_setting('analista.cliente', true);

create or replace view analista.campanhas with (security_barrier = true) as
select id, campanha_externa_id, nome, objectivo, estado, plataforma, criada_em_plataforma
from public.lexia_campanhas
where cliente_slug = current_setting('analista.cliente', true);

create or replace view analista.campanha_custos with (security_barrier = true) as
select campanha_id, dia, gasto, moeda, alcance, impressoes, cliques, cliques_link, cpm, ctr, accoes
from public.lexia_campanha_custos
where cliente_slug = current_setting('analista.cliente', true);

create or replace view analista.frases_anuncio with (security_barrier = true) as
select frase, campanha_externa_id, activa, criado_em
from public.lexia_frases_anuncio
where cliente_slug = current_setting('analista.cliente', true);

create or replace view analista.analises_conversas with (security_barrier = true) as
select identificador_conversa, canal, primeira_mensagem_em, ultima_mensagem_em,
       quantidade_mensagens, resumo, intencao, etapa_comercial, sentimento, resultado,
       objecoes, pontos_fortes, oportunidades, confianca, analisado_em
from public.lexia_conversation_insights
where cliente_slug = current_setting('analista.cliente', true);

-- Turnos do agente: sem prompts, passos, tokens, custos nem erros técnicos.
create or replace view analista.turnos with (security_barrier = true) as
select id, identificador_conversa, canal, modo, estado, motivo, rota,
       mensagem_cliente, mensagens, handoff, resumo, duracao_ms, iniciado_em, criado_em
from public.lexia_turnos
where cliente_slug = current_setting('analista.cliente', true);

create or replace view analista.handoffs with (security_barrier = true) as
select id, telefone, nome_contacto, motivo, prioridade, resumo, status, origem, criado_em, atualizado_em
from public.lexia_handoffs
where cliente_slug = current_setting('analista.cliente', true);

create or replace view analista.feedbacks with (security_barrier = true) as
select id, origem, avaliacao, comentario, mensagem_cliente, resposta_agente, status, criado_em
from public.lexia_feedbacks
where cliente_slug = current_setting('analista.cliente', true);

create or replace view analista.bloqueios with (security_barrier = true) as
select canal, identificador, nome, motivo, criado_em
from public.lexia_bloqueios
where cliente_slug = current_setting('analista.cliente', true);

create or replace view analista.produtos with (security_barrier = true) as
select id, nome, unidade, notas, activo, criado_em
from public.lexia_produtos
where cliente_slug = current_setting('analista.cliente', true);

create or replace view analista.produto_movimentos with (security_barrier = true) as
select produto_id, tipo, quantidade, custo_total, servico_nome, nota, ocorrido_em
from public.lexia_produto_movimentos
where cliente_slug = current_setting('analista.cliente', true);

-- Só o papel leitor vê as vistas (e o dono delas, que corre a migração).
do $$
declare v record;
begin
  for v in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'analista' and c.relkind = 'v' loop
    execute format('revoke all on analista.%I from public, anon, authenticated, service_role', v.relname);
    execute format('grant select on analista.%I to analista_leitor', v.relname);
  end loop;
end $$;

-- ---------------------------------------------------------------- filtro de texto
-- Devolve NULL se o texto passa; senão o motivo (curto, para o modelo corrigir).
create or replace function analista.motivo_recusa(p_sql text)
returns text
language plpgsql
stable
set search_path = pg_catalog
as $$
declare
  s text := coalesce(p_sql, '');
  sem_literais text;
  profundidade int := 0;
  ch text;
  esquema text;
  proibida text;
begin
  if length(s) > 8000 then return 'consulta longa demais (máx. 8000 caracteres)'; end if;
  s := btrim(s, E' \t\r\n');
  if s ~ ';\s*$' then s := regexp_replace(s, ';\s*$', ''); end if; -- um ';' final é tolerado
  if s = '' then return 'consulta vazia'; end if;
  -- Barra invertida (E'\'') e U& mudam o fim dos textos: recusados em qualquer sítio.
  if position(E'\\' in s) > 0 then return 'sem barra invertida'; end if;
  if s ~* 'u&' then return 'sem U&'; end if;
  if s !~* '^\(*\s*(select|with)\M' then return 'só SELECT ou WITH'; end if;

  -- Tira os textos entre plicas ('' é uma plica dentro do texto). Sem barra
  -- invertida, a leitura das plicas aqui e a do Postgres só podem divergir num
  -- comentário, '$' ou '"' FORA de um texto, e esses são recusados a seguir.
  sem_literais := regexp_replace(s, '''([^'']|'''')*''', ' ''x'' ', 'g');
  if position('''' in regexp_replace(sem_literais, '''x''', '', 'g')) > 0 then return 'plica sem fechar'; end if;
  sem_literais := lower(sem_literais);
  if position(';' in sem_literais) > 0 then return 'só uma instrução (sem ";")'; end if;
  if sem_literais ~ '--' or sem_literais ~ '/\*' then return 'sem comentários'; end if;
  if position('"' in sem_literais) > 0 then return 'sem aspas duplas (use nomes simples, sem aspas)'; end if;
  if position('$' in sem_literais) > 0 then return 'sem "$"'; end if;

  -- Parênteses equilibrados (não deixa fechar o embrulho do servidor).
  foreach ch in array regexp_split_to_array(sem_literais, '') loop
    if ch = '(' then profundidade := profundidade + 1;
    elsif ch = ')' then profundidade := profundidade - 1;
      if profundidade < 0 then return 'parênteses desequilibrados'; end if;
    end if;
  end loop;
  if profundidade <> 0 then return 'parênteses desequilibrados'; end if;

  -- Palavras de escrita, DDL, sessão e transacção.
  proibida := substring(sem_literais from '\m(insert|update|delete|merge|truncate|drop|alter|create|grant|revoke|copy|call|do|execute|prepare|deallocate|listen|notify|unlisten|lock|vacuum|analyze|analyse|cluster|reindex|refresh|set|reset|discard|begin|start|commit|rollback|abort|savepoint|release|into|comment|security|import|load|checkpoint|explain|declare|fetch|close|move|returning)\M');
  if proibida is not null then return format('palavra não permitida: %s', proibida); end if;
  if sem_literais ~ '\mfor\s+(no\s+key\s+)?(update|share|key)\M' then return 'sem FOR UPDATE/SHARE'; end if;

  -- Funções e catálogos perigosos (executam texto, mudam a sessão, leem ficheiros ou o servidor).
  proibida := substring(sem_literais from '\m(pg_[a-z0-9_]*|information_schema|set_config|current_setting|[a-z_]*_to_xml[a-z_]*|[a-z_]*xmlschema|dblink[a-z_]*|lo_[a-z_]*|txid_[a-z_]*|nextval|setval|currval|inet_[a-z_]*|version|query_to[a-z_]*|cursor_to[a-z_]*|table_to[a-z_]*|schema_to[a-z_]*|database_to[a-z_]*|ts_stat|ts_rewrite|http[a-z_]*|net|vault|auth|storage|extensions|cron|graphql|realtime|supabase_[a-z_]*|public)\M');
  if proibida is not null then return format('nome não permitido: %s', proibida); end if;

  -- Nenhum `schema.` que não seja analista (o resto dos pontos são apelidos de tabela).
  for esquema in select nspname from pg_namespace where nspname <> 'analista' loop
    if sem_literais ~ ('\m' || regexp_replace(lower(esquema), '([^a-z0-9_])', '\\\1', 'g') || '\s*\.') then
      return format('só as vistas do schema analista (não %s)', esquema);
    end if;
  end loop;
  return null;
end $$;

-- ---------------------------------------------------------------- execução
create or replace function analista.consultar(p_cliente text, p_sql text)
returns jsonb
language plpgsql
security definer
set search_path = analista, pg_catalog
-- O custo do EXPLAIN só é comparável com os planos normais (um seqscan
-- desligado soma 1e10 a tudo e recusaria qualquer consulta).
set enable_seqscan = on
as $$
declare
  motivo text;
  corpo text;
  plano jsonb;
  custo numeric;
  r jsonb;
  total bigint;
  limite constant int := 200;
  custo_maximo constant numeric := 5000000;
begin
  if p_cliente is null or p_cliente !~ '^[a-z0-9_]{2,80}$' then
    raise exception 'analista: empresa inválida' using errcode = '22023';
  end if;
  motivo := analista.motivo_recusa(p_sql);
  if motivo is not null then
    return jsonb_build_object('erro', motivo);
  end if;
  corpo := regexp_replace(btrim(p_sql, E' \t\r\n'), ';\s*$', '');

  perform set_config('transaction_read_only', 'on', true);
  perform set_config('statement_timeout', '8s', true);
  perform set_config('analista.cliente', p_cliente, true);

  begin
    execute 'explain (format json) select * from (' || corpo || ') as _r' into plano;
    custo := (plano -> 0 -> 'Plan' ->> 'Total Cost')::numeric;
    if custo > custo_maximo then
      perform set_config('analista.cliente', '', true);
      return jsonb_build_object('erro', 'consulta pesada demais; filtre por datas, agregue ou use LIMIT');
    end if;

    execute format(
      'select count(*), coalesce(jsonb_agg(to_jsonb(_s._r) order by _s._n) filter (where _s._n <= %s), ''[]''::jsonb)
         from (select _r, row_number() over () as _n from (%s) as _r) as _s',
      limite, corpo)
      into total, r;
  exception when others then
    perform set_config('analista.cliente', '', true);
    -- A mensagem do Postgres ajuda o modelo a corrigir (coluna errada, tipo, etc.).
    return jsonb_build_object('erro', left(sqlerrm, 300));
  end;

  if current_setting('analista.cliente', true) is distinct from p_cliente then
    raise exception 'analista: a empresa mudou durante a consulta' using errcode = '42501';
  end if;
  perform set_config('analista.cliente', '', true);

  return jsonb_build_object('linhas', r, 'total', total, 'mostradas', least(total, limite), 'truncado', total > limite);
end $$;

-- O dono da função é o papel leitor: a consulta corre com os privilégios DELE.
grant create on schema analista to analista_leitor;
alter function analista.consultar(text, text) owner to analista_leitor;
alter function analista.motivo_recusa(text) owner to analista_leitor;
revoke create on schema analista from analista_leitor;

revoke all on function analista.consultar(text, text) from public, anon, authenticated;
revoke all on function analista.motivo_recusa(text) from public, anon, authenticated;
grant execute on function analista.consultar(text, text) to service_role;
grant execute on function analista.motivo_recusa(text) to analista_leitor;

-- Entrada pela API (PostgREST expõe `public`). O statement_timeout declarado
-- aqui é aplicado pelo PostgREST à transacção do pedido.
create or replace function public.analista_consultar(p_cliente text, p_sql text)
returns jsonb
language sql
security invoker
set statement_timeout = '8s'
set search_path = pg_catalog
as $$ select analista.consultar(p_cliente, p_sql) $$;

revoke all on function public.analista_consultar(text, text) from public, anon, authenticated;
grant execute on function public.analista_consultar(text, text) to service_role;
