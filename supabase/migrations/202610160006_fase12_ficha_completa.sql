-- Fase 12 — a ficha do cliente deixa de ser só nome, telefone e notas
--
-- Esta migration pertence ao Supabase CENTRAL da Lexia.
--
-- O que resolve
-- -------------
-- A ficha guardava três coisas sobre uma pessoa: nome, telefone e um campo de
-- notas onde cabia tudo o resto. O Arthur pediu os campos que o dono preenche
-- quando regista alguém à mão — email, morada, carro, idade — e, sobretudo,
-- POR ONDE é que a pessoa chegou.
--
-- Porque é que o canal de aquisição é o campo que interessa
-- --------------------------------------------------------
-- Já existe uma resposta automática a essa pergunta: as colunas `origem_*`,
-- que o Omnichannel preenche a partir do referral que a Meta manda num clique
-- de anúncio para o WhatsApp. O problema é a cobertura. Medido a 2026-10-16:
--
--     detail_by_cordeiro    1001 contactos      26 com origem    2,6%
--     miranda_skin_experts   573 contactos      24 com origem    4,2%
--
-- Em 97% dos casos não há resposta nenhuma — o Instagram não manda referral, e
-- quem chegou por indicação ou por uma pesquisa no Google nunca passou por lado
-- nenhum que deixasse rasto. O dono sabe; a base não.
--
-- Porque é que isto NÃO escreve em `origem_tipo`
-- ---------------------------------------------
-- Seria tentador pôr a escolha do dono na mesma coluna e ter um campo só. Mas
-- `origem_tipo` tem uma propriedade que vale dinheiro: o que lá está foi
-- medido, não lembrado. Se uma escolha à mão entrasse lá, deixava de haver
-- maneira de separar as 26 linhas que a Meta confirmou das centenas que alguém
-- preencheu de memória meses depois — e o número de referência para julgar o
-- custo por cliente de uma campanha ficava sem valor.
--
-- Por isso são duas colunas. `origem_tipo` continua a ser só do sistema;
-- `origem_manual` é do dono. Quando as duas existem, a ficha mostra as duas e
-- diz de onde vem cada uma.

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
-- 1. Campos da pessoa
-- --------------------------------------------------------------------------

-- Sem validação de forma do email de propósito: o dono escreve o que o cliente
-- lhe deu, e um endereço torto gravado é mais útil do que um formulário que se
-- recusa a gravar. O limite é o do RFC para o endereço inteiro.
alter table public.lexia_contactos
  add column if not exists email text
    check (email is null or char_length(email) <= 320);

alter table public.lexia_contactos
  add column if not exists morada text
    check (morada is null or char_length(morada) <= 512);

-- O carro da pessoa. Existe também `viatura` em cada marcação, na base do
-- cliente, mas essa é a viatura DAQUELE serviço — esta é a que a pessoa tem.
-- Só o Detail mostra este campo; numa clínica de pele não quer dizer nada.
alter table public.lexia_contactos
  add column if not exists viatura text
    check (viatura is null or char_length(viatura) <= 160);

-- Idade e não data de nascimento porque foi o que o dono pediu e é o que ele
-- sabe. Fica datada: `idade_registada_em` diz de quando é o número, para
-- daqui a dois anos se perceber que 34 já não é 34.
alter table public.lexia_contactos
  add column if not exists idade smallint
    check (idade is null or (idade >= 1 and idade <= 120));

alter table public.lexia_contactos
  add column if not exists idade_registada_em timestamptz;

-- --------------------------------------------------------------------------
-- 2. Canal de aquisição dito pelo dono
-- --------------------------------------------------------------------------

-- A lista é fechada para o campo servir para contar. Texto livre dava
-- "Instagram", "instagram", "IG" e "insta" como quatro canais diferentes. Quem
-- precisa de dizer outra coisa escolhe `outro` e escreve em `origem_manual_nota`.
alter table public.lexia_contactos
  add column if not exists origem_manual text
    check (
      origem_manual is null
      or origem_manual in (
        'google',
        'meta',
        'whatsapp',
        'indicacao',
        'organico',
        'cliente_antigo',
        'outro'
      )
    );

alter table public.lexia_contactos
  add column if not exists origem_manual_nota text
    check (origem_manual_nota is null or char_length(origem_manual_nota) <= 200);

-- `outro` sem explicação é uma linha que ninguém consegue ler daqui a um ano, e
-- uma explicação sem `outro` é lixo que ficou de uma escolha trocada.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'lexia_contactos_origem_manual_outro_tem_nota'
  ) then
    alter table public.lexia_contactos
      add constraint lexia_contactos_origem_manual_outro_tem_nota
      check (
        (origem_manual = 'outro' and origem_manual_nota is not null)
        or (origem_manual is distinct from 'outro' and origem_manual_nota is null)
      );
  end if;
end;
$$;

-- Quem escolheu o canal e quando. Serve para o mesmo que `origem_tipo` serve
-- sozinho: saber se a resposta é de confiança. Um canal escolhido no dia em que
-- a pessoa chegou vale mais do que um escolhido seis meses depois.
alter table public.lexia_contactos
  add column if not exists origem_manual_por uuid
    references auth.users(id) on delete set null;

alter table public.lexia_contactos
  add column if not exists origem_manual_em timestamptz;

-- --------------------------------------------------------------------------
-- 3. Índice
-- --------------------------------------------------------------------------

-- A pergunta que este campo existe para responder é "quantos clientes vieram
-- de cada canal, neste cliente". É sempre por (cliente, canal).
create index if not exists lexia_contactos_origem_manual_idx
  on public.lexia_contactos (cliente_slug, origem_manual)
  where origem_manual is not null;

-- --------------------------------------------------------------------------
-- 4. Permissões
-- --------------------------------------------------------------------------
--
-- Como na Fase 11: a `service_role` já tem tudo e é por ela que o painel lê,
-- sempre com `.eq("cliente_slug", …)`. Estes grants são para o `authenticated`.

grant select (
  email,
  morada,
  viatura,
  idade,
  idade_registada_em,
  origem_manual,
  origem_manual_nota,
  origem_manual_em
) on public.lexia_contactos to authenticated;

comment on column public.lexia_contactos.viatura is
  'O carro da pessoa, escrito no painel. Diferente de marcacoes.viatura, que e o carro daquele servico. So o Detail mostra este campo.';
comment on column public.lexia_contactos.idade is
  'Idade em anos no momento em que foi registada. Ver idade_registada_em antes de a usar.';
comment on column public.lexia_contactos.origem_manual is
  'Canal de aquisicao dito pelo dono. NAO confundir com origem_tipo, que e capturada da Meta e so existe em 3% dos contactos. Esta e lembrada, aquela e medida.';

commit;
