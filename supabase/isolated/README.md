# Ambiente isolado do Lote 1

Este diretório reconstrói apenas o contrato mínimo necessário para testar o
Lote 1 em um projeto Supabase novo e descartável. Não é um baseline de
produção e nunca deve ser aplicado em staging ou produção.

## Ordem de reconstrução

1. Crie um projeto Supabase exclusivo para testes e anote o `project ref`.
2. Faça um backup vazio desse projeto ou confirme que ele pode ser apagado.
3. Aplique `000000000000_lote1_test_baseline.sql` com uma conexão direta.
4. Grave a identidade do projeto antes de qualquer teste:

   ```sql
   insert into public.lexia_environment_identity (
     id,
     project_ref,
     environment,
     disposable
   ) values (
     true,
     '<PROJECT_REF_DESCARTAVEL>',
     'isolated_test',
     true
   );
   ```

5. Aplique `supabase/migrations/202609220001_lexia_ai_analyst.sql`.
6. Crie o índice concorrente fora de transação com
   `npm run db:lote1:index`, usando o ref descartável como destino esperado.
7. Aplique
   `supabase/migrations/202610030002_lote1_authorization_and_private_workflows.sql`.
8. Rode os checks de compatibilidade da aplicação, sem executar ainda a suíte
   integrada que exige o corte de privilégios.
9. Aplique
   `supabase/migrations/202610030003_lote1_restrict_workflow_destinations.sql`.
10. Execute `supabase/checks/202610030002_lote1_verify.sql` e somente então
    `npm run test:lote1:isolated`.

O baseline não cria usuários ou dados funcionais. A suíte cria dados com
slugs aleatórios e usa exclusivamente destinos `*.invalid`, que não resolvem
para serviços externos. Ela valida o marcador remoto e todas as identidades
antes da primeira escrita.

Falhas dos testes e falhas da limpeza são relatadas separadamente. Qualquer
falha de limpeza deixa o processo com código de saída diferente de zero e
lista apenas o recurso e o código do erro, sem imprimir credenciais ou dados.
