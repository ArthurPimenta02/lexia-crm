-- Fase 21: contactos bloqueados de cada agente.
--
-- O PROBLEMA QUE RESOLVE
-- No n8n da Miranda, as pessoas a quem a Carol não responde (equipe, família,
-- VIPs, marketing; e contas do Instagram) estão escritas dentro de dois nós
-- ("Bloquear Contatos WhatsApp" e "Contatos Bloqueados Meta"). Mudar a lista
-- é editar código. O agente em código lê daqui, e a tela /admin/bloqueios
-- deixa o Arthur bloquear e desbloquear sozinho.
--
-- O bloqueio automático de quem está salvo na agenda do celular do Samuel
-- (consulta à Z-API a cada mensagem) continua no código: não é uma lista.
--
-- identificador: telefone só com dígitos e DDI (WhatsApp), ou o IGSID/PSID da
-- pessoa (Instagram/Messenger) — o mesmo que aparece depois de "<canal>:" no
-- identificador_conversa.
--
-- RLS ligado, nenhuma policy, grants só para a service_role: a tela lê do
-- servidor depois de confirmar lexia_admin; o agente lê com a service_role.
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

create table if not exists public.lexia_bloqueios (
  id uuid primary key default extensions.gen_random_uuid(),
  cliente_slug text not null references public.lexia_clientes(slug)
    on update cascade on delete restrict,
  canal text not null check (canal in ('whatsapp', 'instagram', 'messenger')),
  identificador text not null check (identificador ~ '^[0-9]{6,20}$'),
  nome text check (nome is null or char_length(nome) <= 120),
  motivo text check (motivo is null or char_length(motivo) <= 300),
  criado_em timestamptz not null default now(),
  criado_por uuid,
  constraint lexia_bloqueios_cliente_canal_identificador_key
    unique (cliente_slug, canal, identificador)
);

create index if not exists lexia_bloqueios_cliente_idx
  on public.lexia_bloqueios (cliente_slug, criado_em desc);

alter table public.lexia_bloqueios enable row level security;

revoke all on public.lexia_bloqueios from anon, authenticated;
grant select, insert, delete on public.lexia_bloqueios to service_role;

commit;
