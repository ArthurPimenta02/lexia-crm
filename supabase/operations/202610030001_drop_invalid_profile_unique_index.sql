-- Explicit recovery operation. Use only after the verification query confirms
-- the index exists, is invalid and is not attached to a constraint.
-- This file MUST run outside a transaction.
drop index concurrently public.lexia_usuarios_clientes_user_id_key;
