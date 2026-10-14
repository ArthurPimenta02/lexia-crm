-- Verificacao so-leitura apos 202610130001_lote3_atribuicao_origem.sql.
-- Seguro de correr em producao: nao escreve nada.
-- O bloco final levanta excepcao se algum invariante faltar.

begin transaction read only;

-- 1. As colunas existem e sao todas nullable (nenhuma escrita antiga quebra).
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'lexia_contactos'
  and column_name like 'origem%'
order by column_name;

-- 2. O indice parcial existe.
select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'lexia_contactos'
  and indexname = 'lexia_contactos_origem_source_id_idx';

-- 3. RLS continua ligada na tabela (as colunas novas herdam as policies).
select relname, relrowsecurity as rls_enabled
from pg_class
where relnamespace = 'public'::regnamespace
  and relname = 'lexia_contactos';

-- 4. Leitura operacional: quantos contactos ja tem atribuicao, por cliente.
--    Logo apos a migration isto devolve zero em todo o lado -- e o esperado.
--    Passa a crescer assim que o no do n8n for activado.
select
  cliente_slug,
  count(*) as contactos,
  count(origem_source_id) as com_anuncio,
  count(*) filter (where origem_tipo = 'organico') as organicos,
  max(origem_capturada_em) as ultima_captura
from public.lexia_contactos
group by cliente_slug
order by cliente_slug;

do $$
declare
  faltam text[];
  col text;
begin
  foreach col in array array[
    'origem_tipo','origem_source_id','origem_titulo',
    'origem_url','origem_dados','origem_capturada_em'
  ] loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'lexia_contactos'
        and column_name = col
    ) then
      faltam := array_append(faltam, col);
    end if;
  end loop;

  if faltam is not null then
    raise exception 'Colunas de atribuicao em falta: %', array_to_string(faltam, ', ');
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'lexia_contactos_origem_source_id_idx'
  ) then
    raise exception 'Indice lexia_contactos_origem_source_id_idx em falta';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'lexia_contactos'
      and column_name like 'origem%'
      and is_nullable = 'NO'
  ) then
    raise exception 'Coluna de atribuicao NOT NULL: escritas existentes do n8n iriam falhar';
  end if;
end;
$$;

commit;
