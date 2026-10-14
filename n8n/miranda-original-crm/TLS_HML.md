# Certificado Supabase / n8n HML

Preparacao e aplicacao em 11/10/2026 (Brasil). Estado: **trust store aplicado
e credencial HML conectando com SSL validado**, apos aprovacao explicita.

## Aplicacao e resultado

- Usuario autorizou manter a instancia existente e prosseguir com a interrupcao.
- Nenhuma execucao running/new na consulta imediatamente anterior a recriacao.
  Nao foi cancelado/limpo job ou fila.
- Backup restrito (0600) na propria VPS:
  `/docker/n8n/docker-compose.yml.before-lexia-ca-20261011-2317`.
- Patch aplicado com fuzz zero; diff confirmou apenas dois mounts da CA.
  `docker compose config --quiet` passou antes/depois.
- Compose apos patch SHA-256:
  `7877e0e4d42d3a5387ada390c56cfa14284c6c33fd88ae4536bb94d96f6fad57`.
- Recriacao iniciada 23:19:09 Brasil (02:19:09 UTC de 12/10), somente servicos
  `n8n` e `n8n-worker`, com `--no-deps --pull never --timeout 120`.
  Ambos iniciaram as 23:19:16, com mesmo ID de imagem e restart_count zero.
- Primeiro probe externo retornou HTTP 404 na transicao do proxy; seguinte
  retornou 200. Painel/readiness 200 revalidados apos startup. Nao ha
  amostragem continua para afirmar duracao exata ou ausencia de perda de webhook.
- Logs filtrados confirmaram trust store, n8n ready e worker ready, versao
  2.42.6. CA e hash link `4cdc2cb7.0` presentes nos mounts.
- Postgres, Redis e Traefik mantiveram mesmos IDs e StartedAt anteriores;
  containers Frappe tambem permaneceram sem recriacao.
- Tres workflows Miranda de producao e tres copias HML mantiveram
  active/versionId/activeVersionId anteriores. Nenhum workflow foi editado,
  publicado, ativado, arquivado ou executado manualmente nesta manutencao.
- Credencial `Lexia HML Central Postgres` autenticou via metodo nativo
  `schemaSearch` do Postgres 2.6; lista inclui public. Somente metadados,
  sem dados de cliente, writes ou migrations. SSL Require mantido,
  Ignore SSL Issues off. Nao homologa SQL operacional/IA/fluxo integrado.
- Auditoria encontrou erro preexistente em RASTREIO GERADO / Enviar Texto1:
  `133957` apos manutencao e `133947` anterior possuem a mesma mensagem
  NodeApiError, sem TLS. Outras falhas desse workflow apareceram no intervalo;
  nao foram corrigidas/reexecutadas. Nao afirmar que toda a instancia esta
  livre de erros; essa automacao precisa de revisao propria.

Nenhum modelo/provedor de canal foi chamado pelo agente executor. Eventos
automaticos continuam sujeitos aos workflows de producao originais.

## Evidencia

- Arquivo publico fornecido pelo usuario: `prod-ca-2021 (1).crt`.
- Subject/issuer: Supabase Root 2021 CA. CA autoassinada valida ate 26/04/2031.
- SHA-256: `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`.
- Preparado em `/docker/n8n/lexia-hml-ca/supabase-root-2021.crt` na VPS.
  Pasta/arquivo pertencem ao UID/GID 1000, para o startup `c_rehash` do n8n.
- Imagem atualmente usada pelo servidor/worker: n8n 2.42.6, Node 26.7.0;
  ID `sha256:526daa38b68e923cc00c5280d18b4da5d489f115a73bdbf3b8e452b184197a9a`.
- Probe descartavel com essa imagem validou CA e hostname, TLS 1.3, somente
  SSLRequest PostgreSQL e handshake TLS. Nenhuma senha, autenticacao ou SQL.
- `scripts/check-postgres-tls-only.mjs`: syntax check e lint passaram.
- Na preparacao, patch validado por dry-run; aplicacao posterior descrita acima.
- Consulta de metadados nao encontrou execucoes running/new na preparacao;
  isso deve ser conferido novamente imediatamente antes da manutencao.
- Na preparacao nao houve alteracao do compose em uso nem restart. Na aplicacao
  posterior acrescentados mounts e recriados somente servidor/worker.
  Sem alteracao de credenciais/workflows/banco/Redis, pull de imagem ou publicacao.

## Procedimento Executado

O n8n esta em queue mode: servidor `n8n` e worker `n8n-worker` precisam da
mesma pasta adicional de confianca. Reiniciar so o servidor nao basta.
Recriar esses componentes interrompe brevemente painel/webhooks e pode afetar
Miranda; nao reiniciar a VPS inteira, Traefik, Postgres ou Redis.

1. Reconsultar execucoes running/new e aguardar janela segura; nao interromper
   jobs nem limpar filas. Nova execucao pode surgir depois dessa consulta.
2. Salvar backup restrito do compose original na propria VPS, sem trazer seus
   valores secretos para este repo. Hash observado na preparacao:
   `0e0821f439a321c2a0bbc9a6444381c5fa8c1ab0e2a34e64a51b4b69593d9599`.
3. Conferir se esse hash/estrutura continuam iguais. Se divergirem, revisar
   novamente, nao aplicar patch automaticamente por contexto semelhante.
4. `n8n-ca-compose.patch` acrescenta apenas o volume de certificados a ambos
   os servicos, mantendo os demais volumes/redes/envs/imagens.
   Fazer dry-run e `docker compose config --quiet` antes de aplicar rollout.
5. Conferir tags locais continuam apontando para o mesmo ID em uso. Nao
   atualizar n8n durante essa manutencao; usar `--pull never` e `--no-deps`.
6. Recriar somente `n8n` e `n8n-worker`, com shutdown gracioso e janela aprovada.
7. Conferir health/readiness, imagem, mounts, trust store e ausencia de novas
   falhas/crashes. Logs completos podem conter dados privados: nao exportar.
8. Repetir teste da credencial HML com SSL Require e Ignore SSL Issues off.
   Handshake aprovado nao prova senha, permissoes, schema ou SQL do workflow.
9. Registrar resultado e atualizacao do estado neste documento/auditoria.

Exemplo de merge (nao substituir base): `docker-compose.ca.example.yaml`.
O patch deve entrar no compose principal, para futuras recriacoes nao perderem
o mount. O exemplo override isolado nao foi ativado.

## Rollback

Se o n8n nao voltar saudavel, restaurar o compose a partir do backup restrito
e recriar somente os dois componentes com a **mesma imagem anterior**.
Nao apagar volumes/banco, executar `down -v`, limpar Redis ou editar workflows.
Certificado publico pode permanecer preparado fora dos containers; sem mount
ele nao altera o trust store. Rollback restaura servico, mas nao resolve TLS HML.

Referencias oficiais:
- https://docs.n8n.io/hosting/configuration/configuration-examples/custom-certificate-authority/
- https://supabase.com/docs/guides/platform/ssl-enforcement

O entrypoint observado do n8n executa `c_rehash` e configura `SSL_CERT_DIR` e
`--use-openssl-ca` quando encontra `/opt/custom-certificates`. Nao foi usada
nenhuma opcao que aceite certificados arbitrarios/inseguros.
