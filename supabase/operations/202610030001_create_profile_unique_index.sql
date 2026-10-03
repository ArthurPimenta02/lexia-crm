-- This file MUST be executed by psql in autocommit mode, outside a transaction.
-- Run the preflight first. Do not add IF NOT EXISTS: an invalid or differently
-- defined index must stop the deployment instead of being silently accepted.
create unique index concurrently lexia_usuarios_clientes_user_id_key
  on public.lexia_usuarios_clientes (user_id);
