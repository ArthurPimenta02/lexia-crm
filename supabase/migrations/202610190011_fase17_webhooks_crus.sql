-- Fase 17: guardar o que a Meta manda, tal e qual.
--
-- O PROBLEMA QUE RESOLVE
-- Hoje o n8n e o unico que ve o webhook da Meta. Ele le o que sabe ler, grava
-- origem_source_id quando o encontra, e atira o resto fora. Quando a origem
-- nao aparece na ficha, nao ha como saber se a Meta nao mandou ou se o n8n nao
-- soube ler -- e as duas respostas levam a trabalhos opostos.
--
-- Medido a 19/10/2026 no Detail, desde 15/10 (quando a captura comecou a
-- funcionar): WhatsApp 11 de 30 contactos com anuncio, Instagram 1 de 2,
-- Messenger 0 de 8. O ramo do Messenger nunca gravou um anuncio em 540
-- contactos de sempre. Sem o payload cru isso e uma suspeita; com ele e uma
-- resposta.
--
-- PORQUE CRU E NAO INTERPRETADO
-- As colunas aqui sao so as que servem para encontrar a linha: cliente, canal,
-- data, e uma impressao digital para nao guardar a mesma entrega duas vezes. A
-- atribuicao NAO e derivada na escrita de proposito. Se o leitor estiver
-- errado -- e a razao de existir desta tabela e suspeitar que esta --, derivar
-- na escrita grava o erro para sempre. Guardando o corpo intacto, corrigir o
-- leitor volta a dar a resposta certa sobre o passado.
--
-- PORQUE O CORPO NAO E LEGIVEL PELO CLIENTE AUTENTICADO
-- O corpo traz o texto da mensagem e o identificador de quem a enviou. Isto
-- nao e dado novo (o agente ja o guarda na base do cliente), mas passa a estar
-- tambem na base central, e por isso fica fechado: RLS ligado e nenhuma
-- policy, grants so para a service_role. Nem o `authenticated` nem o `anon`
-- conseguem ler uma linha. E uma ferramenta de diagnostico do servidor, nao
-- material de ecra.
--
-- Esta migration e aditiva: cria uma tabela nova e nao toca em nada existente.

begin;

-- Guard: o risco real e correr isto no Supabase errado. Cada cliente tem o seu
-- projecto; isto vive apenas na base central da Lexia, a unica com
-- lexia_clientes.
do $$
begin
  if to_regclass('public.lexia_clientes') is null then
    raise exception
      'lexia_clientes nao existe nesta base. Esta migration pertence ao Supabase CENTRAL da Lexia, nao ao projecto de um cliente.';
  end if;
end;
$$;

create table if not exists public.lexia_webhooks_meta (
  id uuid primary key default extensions.gen_random_uuid(),
  cliente_slug text not null references public.lexia_clientes(slug)
    on update cascade on delete restrict,
  -- O canal declarado por quem nos entregou o corpo. 'desconhecido' e um valor
  -- valido e nao um defeito: o campo `object` da Meta pode trazer algo que
  -- ainda nao conhecemos, e nesse caso queremos a linha gravada para a poder
  -- ler, nao um erro que a apaga.
  canal text not null
    check (canal in ('whatsapp', 'instagram', 'messenger', 'desconhecido')),
  -- O valor literal de `object` no corpo da Meta, sem traducao. E a unica forma
  -- de descobrir um canal novo depois de ele aparecer.
  objecto text check (char_length(objecto) between 1 and 128),
  -- O corpo inteiro, como chegou. Nunca escrever aqui um objecto montado por
  -- nos: perde-se exactamente a informacao que justifica a tabela.
  corpo jsonb not null,
  -- sha256 do corpo. A Meta reentrega o mesmo webhook quando nao recebe 200, e
  -- a reentrega e byte a byte igual; sem isto a tabela enchia-se de copias.
  impressao_digital text not null check (impressao_digital ~ '^[0-9a-f]{64}$'),
  recebido_em timestamptz not null default now(),
  constraint lexia_webhooks_meta_impressao_key
    unique (cliente_slug, impressao_digital)
);

-- A leitura e sempre "este cliente, do mais recente para tras".
create index if not exists lexia_webhooks_meta_cliente_recebido_idx
  on public.lexia_webhooks_meta (cliente_slug, recebido_em desc);

-- ---------------------------------------------------------------------------
-- Permissoes: fechado a tudo o que nao seja a service_role.
-- ---------------------------------------------------------------------------
alter table public.lexia_webhooks_meta enable row level security;

revoke all on public.lexia_webhooks_meta
from public, anon, authenticated, service_role;

grant select, insert, delete on public.lexia_webhooks_meta to service_role;

-- Nenhum `create policy` aqui, e de proposito: RLS ligado sem policies nega
-- tudo ao `authenticated`. Quem vier a precisar de mostrar isto no ecra tem de
-- escrever a policy e pensar no que expoe.

comment on table public.lexia_webhooks_meta is
  'Corpo cru dos webhooks de mensagens da Meta, por cliente. Ferramenta de diagnostico: nunca interpretar na escrita, so na leitura.';
comment on column public.lexia_webhooks_meta.corpo is
  'O corpo tal como a Meta o enviou. A atribuicao deriva-se daqui na leitura, para que corrigir o leitor corrija tambem o passado.';
comment on column public.lexia_webhooks_meta.impressao_digital is
  'sha256 do corpo, para ignorar as reentregas da Meta. Unico por cliente.';

commit;
