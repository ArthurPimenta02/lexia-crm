-- Fase 11 — ficha de clientes
--
-- Esta migration pertence ao Supabase CENTRAL da Lexia.
--
-- O que resolve
-- -------------
-- O Martim pediu uma ficha por cliente: nome, contacto, o que já comprou e um
-- sítio para escrever notas. Os contactos já existem — o Omnichannel cria uma
-- linha em `lexia_contactos` por cada conversa — mas a tabela foi feita para o
-- agente escrever, não para um humano ler. Faltam-lhe três coisas: notas, uma
-- forma de comparar telefones, e uma forma de dizer "estas duas linhas são a
-- mesma pessoa".
--
-- Porque é que `telefone_digitos` existe
-- -------------------------------------
-- Medido a 2026-10-16 nos 999 contactos do Detail: cinco pessoas têm DUAS
-- linhas cada uma, com o mesmo nome, criadas no mesmo dia, porque a Meta
-- entregou o número em dois formatos. Exemplo real:
--
--     whatsapp:55549711-3266   ->  '55549711-3266'
--     whatsapp:555497113266    ->  '555497113266'
--
-- Comparar o texto da coluna `telefone` não vê isto; comparar só os dígitos
-- vê. Por isso a coluna é gerada pelo Postgres e não calculada na aplicação:
-- assim o aviso de duplicado vale também para as linhas que o agente criar
-- amanhã, e não só para as que o painel criar.
--
-- Porque é que juntar NÃO apaga a linha
-- -------------------------------------
-- Se o painel apagasse o contacto duplicado, o Omnichannel criava-o outra vez
-- na mensagem seguinte daquela conversa — e o Martim juntava os mesmos dois
-- contactos para sempre. Em vez disso, o duplicado fica e aponta para o
-- principal com `fundido_em`. O agente continua a escrever na linha dele sem
-- saber de nada; o painel é que deixa de a mostrar sozinha e passa a mostrá-la
-- por baixo do principal. E como é só uma coluna, separar é desfazer.

begin;

do $$
begin
  if to_regclass('public.lexia_contactos') is null then
    raise exception
      'lexia_contactos nao existe nesta base. Esta migration pertence ao Supabase CENTRAL da Lexia, nao ao projecto de um cliente.';
  end if;
end;
$$;

-- --------------------------------------------------------------------------
-- 1. Colunas novas
-- --------------------------------------------------------------------------

alter table public.lexia_contactos
  add column if not exists notas text
    check (notas is null or char_length(notas) <= 4000);

-- Só os dígitos do telefone, calculados pelo Postgres. NULL quando não há
-- número nenhum, para o índice parcial não guardar linhas vazias.
alter table public.lexia_contactos
  add column if not exists telefone_digitos text
    generated always as (
      nullif(regexp_replace(coalesce(telefone, ''), '[^0-9]', '', 'g'), '')
    ) stored;

-- O contacto principal que absorveu este. NULL é o caso normal.
alter table public.lexia_contactos
  add column if not exists fundido_em uuid
    references public.lexia_contactos(id) on delete set null;

alter table public.lexia_contactos
  add column if not exists fundido_quando timestamptz;

alter table public.lexia_contactos
  add column if not exists fundido_por uuid
    references auth.users(id) on delete set null;

-- Quem no painel mexeu nesta linha pela última vez. O agente deixa isto a NULL.
alter table public.lexia_contactos
  add column if not exists actualizado_por uuid
    references auth.users(id) on delete set null;

-- --------------------------------------------------------------------------
-- 2. Invariantes de quem se funde em quem
-- --------------------------------------------------------------------------

-- Um contacto não se funde em si próprio.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'lexia_contactos_fundido_nao_proprio'
  ) then
    alter table public.lexia_contactos
      add constraint lexia_contactos_fundido_nao_proprio
      check (fundido_em is null or fundido_em <> id);
  end if;
end;
$$;

-- Ou está fundido com data e autor, ou não está fundido de nada.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'lexia_contactos_fundido_coerente'
  ) then
    alter table public.lexia_contactos
      add constraint lexia_contactos_fundido_coerente
      check (
        (fundido_em is null and fundido_quando is null)
        or (fundido_em is not null and fundido_quando is not null)
      );
  end if;
end;
$$;

-- --------------------------------------------------------------------------
-- 3. Índices
-- --------------------------------------------------------------------------

-- O aviso de duplicado é uma pergunta por (cliente, dígitos). Sem este índice
-- era uma varredura da tabela a cada contacto que o Martim criasse.
create index if not exists lexia_contactos_telefone_digitos_idx
  on public.lexia_contactos (cliente_slug, telefone_digitos)
  where telefone_digitos is not null;

-- Para a ficha do principal ir buscar os contactos que absorveu.
create index if not exists lexia_contactos_fundido_idx
  on public.lexia_contactos (cliente_slug, fundido_em)
  where fundido_em is not null;

-- --------------------------------------------------------------------------
-- 4. Permissões
-- --------------------------------------------------------------------------
--
-- A `service_role` já tinha tudo nesta tabela; o painel lê a ficha por ela,
-- com `.eq("cliente_slug", …)` em cada consulta. Estes grants são para o
-- `authenticated`, que lê as colunas uma a uma, e seguem o que as outras
-- tabelas centrais já fazem.

grant select (notas, telefone_digitos, fundido_em, fundido_quando)
  on public.lexia_contactos to authenticated;

comment on column public.lexia_contactos.notas is
  'Notas escritas por um humano no painel. O agente nao le nem escreve aqui.';
comment on column public.lexia_contactos.telefone_digitos is
  'So os digitos de telefone, gerada pelo Postgres. Existe para comparar numeros que a Meta entrega em formatos diferentes.';
comment on column public.lexia_contactos.fundido_em is
  'Contacto principal que absorveu este. A linha fica para o Omnichannel nao a recriar; o painel e que a esconde.';

commit;
