# Lexia CRM

Painel web da Lexia AI para acompanhar agentes, conversas omnichannel,
agendamentos, follow-ups, testes, feedbacks e handoffs, com um analista de IA
baseado em métricas e evidências das conversas.

Produção: `https://app.uselexia.app`

## Documentação Obrigatória

- [`Agent.MD`](./Agent.MD): mapa completo da arquitetura, integrações, banco,
  métricas, rotas, operação, riscos e regras para mudanças seguras.
- [`PLAN.MD`](./PLAN.MD): plano priorizado de estabilização e evolução, com
  critérios de aceite e rollback.
- [`docs/LEXIA_CRM_E_ANALISTA_N8N.md`](./docs/LEXIA_CRM_E_ANALISTA_N8N.md):
  guia completo do projeto e contrato passo a passo do Analista no n8n.
- [`AGENTS.md`](./AGENTS.md): instruções obrigatórias para agentes de código.

Leia esses documentos antes de alterar o projeto. Nunca adicione credenciais,
service roles, senhas ou URLs privadas de webhook ao repositório.

## Desenvolvimento

```bash
npm ci
npm run dev
```

A aplicação local abre em `http://localhost:3000`. As variáveis necessárias
estão documentadas por nome em `Agent.MD`; os valores devem permanecer apenas
em `.env.local` e nos ambientes protegidos da Vercel.

O Analista Lexia também exige a migration
`supabase/migrations/202609220001_lexia_ai_analyst.sql` no Supabase central e
as variáveis server-only `LEXIA_APP_URL`, `N8N_ANALYST_WEBHOOK_URL` e
`N8N_ANALYST_WEBHOOK_SECRET`. O workflow e o procedimento de ativação estão no
guia do n8n acima.

A captura do webhook cru da Meta (`POST /api/webhooks/meta`) exige a migration
`supabase/migrations/202610190011_fase17_webhooks_crus.sql` e a variável
server-only `LEXIA_WEBHOOK_SECRET`, com 32 caracteres ou mais. Sem ela a rota
responde `503` e não aceita nada — de propósito: uma rota de escrita aberta por
uma variável em falta é pior do que uma rota que não existe. Quem chama não é a
Meta; é um nó HTTP Request no início do Omnichannel de cada cliente, que manda
uma cópia do corpo com `Authorization: Bearer` e o cabeçalho
`x-lexia-cliente`.

## Validação

```bash
npm run lint
npx tsc --noEmit
npm run build
npm audit
```

O estado de qualidade e os riscos conhecidos estão registrados em `Agent.MD` e
devem ser consultados antes de qualquer deploy.
