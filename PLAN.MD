# Plano de Estabilização e Evolução da Lexia CRM

> Atualizado em 05/10/2026.
> Este plano parte do estado auditado em `Agent.MD`.
> A ordem das fases é importante. Não avançar para melhorias visuais ou novas métricas antes de preservar código, segredos e banco.

## 1. Objetivo

Transformar o estado atual, que já funciona em produção, em um produto:

- recuperável;
- seguro;
- reproduzível;
- mensurável;
- testável;
- escalável para novos clientes;
- fiel aos eventos de WhatsApp, Instagram e Messenger;
- confiável o suficiente para que métricas sejam apresentadas comercialmente.

## 2. Legenda

- `[ ]` não iniciado.
- `[-]` parcial ou depende de confirmação.
- `[x]` concluído e verificado.
- `P0` risco imediato para continuidade ou segurança.
- `P1` necessário para estabilidade operacional.
- `P2` evolução de arquitetura e produto.
- `P3` melhoria posterior.

## 3. Estado Funcional Atual

### Concluído

- [x] Identidade Lexia unificada para admin e clientes.
- [x] Dashboard cliente com períodos e fuso por cliente.
- [x] Dashboard admin com filtros por cliente, canal e período.
- [x] Conversas de WhatsApp, Instagram e Messenger no mesmo painel.
- [x] Filtro temporal na lista de conversas.
- [x] Histórico completo no painel direito.
- [x] Rolagem própria e abertura no fim da conversa.
- [x] Métricas externas de agendamento para Miranda e Detail.
- [x] `pendente_sinal` contado para Detail.
- [x] Follow-ups centrais contados por origem de mensagem.
- [x] Área de Testes com sessões, polling e feedback.
- [x] Handoffs, feedbacks e ajustes administrativos básicos.
- [x] Deploy em `app.uselexia.app`.

- [x] Leitura das travas do agente no Redis e pausa manual pelo painel (Miranda).
- [x] Cliente central Asteric e workflow de teste cadastrados no Supabase central.

### Parcial

- [-] Conversa semelhante ao mensageiro original. A UI está ajustada, mas o dado histórico não preserva todos os eventos individuais.
- [-] Multi-canal da Miranda. Há dados de Instagram e WhatsApp no central, mas o cadastro central de workflows registra apenas um workflow ativo do tipo Instagram no snapshot.
- [-] Autonomia. Correta apenas a partir de 01/08/2026.
- [-] Gestão de workflows. O banco aceita vários; a tela edita apenas o primeiro elegível.
- [-] Gestão de usuário. Cria e ativa/inativa, mas não redefine senha, troca role ou remove Auth.
- [-] Status de acesso. Nem todas as rotas e ações exigem `status = ativo`.

- [-] Pausas do agente. Ativas só para a Miranda; Detail depende de alterar o omnichannel dela e de credenciais Upstash.
- [-] Handoffs. Os detalhes não são persistidos em lado nenhum; o painel só vê a trava `status` no Redis.
- [-] Onboarding Asteric. O tenant e o workflow estão cadastrados, mas o gatilho n8n compatível com `lexia_modo_teste` ainda precisa ser habilitado e publicado. O export também precisa ser limpo de segredos inline e resíduos da Miranda antes de qualquer uso real.
- [-] Analista Lexia. Migration, interface, fila assíncrona, ferramentas assinadas, callback e polling estão implementados no código. Falta construir/publicar o workflow n8n, configurar as novas envs, fazer deploy e validar Miranda/Detail em produção.

### Não concluído

- [x] Repositório Git remoto configurado e `main` sincronizada no snapshot de
  03/10/2026.
- [ ] Rotação confirmada dos segredos expostos.
- [ ] Baseline completo de migrations e RLS versionado. A migration isolada da IA já existe, mas não substitui o export do banco atual.
- [-] Testes automatizados e CI. A branch do Lote 1 adiciona testes
  comportamentais/de contrato, CI com `npm test`, lint, typecheck e build e uma
  suite mínima de contratos de banco. As suites de banco e runtime passaram no
  projeto descartável; ainda faltam staging e um E2E geral com baseline
  completo do produto.
- [ ] Observabilidade e alertas.
- [ ] Contrato de mensagem com ID/timestamp do provedor.
- [ ] Integração de clientes externos orientada por configuração, sem alterar código.
- [ ] Backups e recuperação documentados/testados.

## 4. P0 - Preservar o Projeto

### 4.1 Versionar o estado atual

- [ ] Criar uma cópia de segurança do diretório inteiro antes de qualquer limpeza.
- [ ] Revisar `git status` e confirmar que nenhum `.env` ou segredo será incluído.
- [ ] Adicionar todos os arquivos reais da aplicação.
- [ ] Criar um commit de baseline com a data do snapshot.
- [ ] Criar repositório privado remoto.
- [ ] Configurar `origin`.
- [ ] Fazer push de `main`.
- [ ] Criar tag de baseline, por exemplo `baseline-2026-09-19`.
- [ ] Confirmar que um clone limpo instala e compila.

Critério de aceite:

- Um computador vazio consegue clonar o projeto, configurar envs e gerar o mesmo build.
- Todo código de produção está rastreado.
- Nenhum segredo aparece no histórico.

Rollback:

- Manter a cópia integral anterior até validar o clone.

### 4.2 Rotacionar segredos expostos

- [ ] Inventariar a service role do Supabase central.
- [ ] Inventariar a service role da Miranda.
- [ ] Inventariar a service role da Detail.
- [ ] Rotacionar todas as chaves que apareceram em chat ou screenshot.
- [ ] Atualizar `.env.local` sem versionar.
- [ ] Atualizar Vercel Production, Preview e Development conforme necessidade.
- [ ] Atualizar n8n se ele usar alguma chave rotacionada.
- [ ] Fazer novo deploy.
- [ ] Revogar chaves antigas.
- [ ] Verificar logs por falhas de autenticação.

Critério de aceite:

- Chaves antigas deixam de funcionar.
- Login, dashboard, agendamentos, criação de usuário e limpeza de teste continuam funcionando.

### 4.3 Corrigir dependências vulneráveis

- [ ] Criar branch exclusiva.
- [ ] Ler guias de upgrade em `node_modules/next/dist/docs/01-app/01-getting-started/18-upgrading.md`.
- [ ] Atualizar Next.js para uma versão sem os alertas, no mínimo a correção apontada pelo audit quando compatível.
- [ ] Atualizar dependências transitivas corrigíveis.
- [ ] Não usar `npm audit fix --force` sem revisar o diff.
- [ ] Rodar lint, typecheck e build.
- [ ] Fazer smoke test de Server Actions, Auth, imagens e deploy Vercel.
- [ ] Rodar `npm audit` novamente e registrar o resultado.

Critério de aceite:

- Zero vulnerabilidade crítica conhecida.
- Nenhuma regressão nos fluxos principais.

### 4.4 Exportar o estado externo

- [ ] Exportar schema do Supabase central.
- [ ] Exportar constraints, índices, triggers, funções e políticas RLS.
- [ ] Exportar schema necessário dos Supabase Miranda e Detail.
- [ ] Exportar workflows n8n em formato versionável, sem credenciais.
- [ ] Inventariar Redis por cliente sem expor conexão.
- [ ] Registrar integrações de calendário/ferramentas por cliente.
- [ ] Armazenar backups cifrados fora do repositório.

Critério de aceite:

- É possível reconstruir banco e workflows em um ambiente novo.

## 5. P0 - Criar um Baseline Verificável

### 5.1 Fixar runtime

- [x] Definir Node 22 ou superior como versão suportada.
- [ ] Criar `.nvmrc` ou `.node-version`.
- [x] Adicionar `engines` em `package.json`.
- [x] Registrar versões Node/npm da auditoria em `Agent.MD`.

### 5.2 Scripts obrigatórios

- [x] Adicionar `typecheck` com `tsc --noEmit`.
- [x] Adicionar `test`.
- [ ] Adicionar `test:e2e`.
- [ ] Adicionar `check` para lint + typecheck + testes.
- [x] Investigar por que `npm run lint` não terminou na auditoria local. O
  bloqueio era causado por placeholders `dataless` do iCloud em
  `node_modules`; com dependências materializadas, o lint concluiu normalmente.

Snapshot do Lote 1 em 05/10/2026: `test` (45/45), lint, typecheck e build
aprovados na copia limpa em `/Users/arthurpimenta/Developer/lexia-crm`. O
bloqueio anterior do lint foi confirmado em dependencias `dataless` da origem.
O projeto descartavel passou conectividade/TLS, migrations `002` e `003`,
verificacao pos-corte, suite minima de banco e limpeza independente. O trilho
adicional de runtime Next passou 13 cenarios de cadastro, edicao, dispatch,
callbacks e exposicao usando somente dados sinteticos e receptor HTTPS local.
O baseline minimo continua sem representar a aplicacao completa, e staging
permanece pendente.

### 5.3 Smoke tests mínimos

- [ ] `/login` carrega.
- [ ] Admin autentica e abre dashboard.
- [ ] Cliente Miranda vê apenas Miranda.
- [ ] Cliente Detail vê apenas Detail.
- [ ] Conversa de Instagram abre.
- [ ] Conversa de WhatsApp abre.
- [ ] Filtro Hoje não altera o histórico completo à direita.
- [ ] Área de Testes recebe resposta pelo `run_id`.
- [ ] Dashboard muda monotonicamente quando um intervalo só aumenta, quando a métrica exige isso.

Critério de aceite:

- Uma única rotina automatizada bloqueia deploy se o baseline falhar.

## 6. P1 - Autorização e Isolamento

### 6.1 Status ativo consistente

- [ ] Criar helper central de autorização.
- [ ] Exigir `profile.status === "ativo"` em layouts admin e cliente.
- [ ] Exigir status ativo em todas as Server Actions.
- [ ] Encerrar sessão ou exibir bloqueio claro para perfil inativo.
- [ ] Definir comportamento para cliente `inativo` ou `suspenso`.
- [ ] Testar todas as combinações role/status.

### 6.2 RLS versionado

- [ ] Criar migrations para todas as tabelas centrais.
- [ ] Versionar políticas por role e `cliente_slug`.
- [ ] Garantir que cliente não lê/escreve outro slug.
- [ ] Garantir que admin Lexia tem acesso global controlado.
- [ ] Garantir que usuário sem perfil não lê dados.
- [ ] Testar políticas com anon key, nunca apenas service role.

### 6.3 Sessão Supabase SSR

- [ ] Revisar guia de autenticação do Next.js 16 e Supabase SSR.
- [ ] Implementar `proxy.ts` se necessário para atualização de sessão.
- [ ] Remover comentário obsoleto sobre middleware ou atualizá-lo.
- [ ] Testar expiração e renovação do token.
- [ ] Testar logout em múltiplas abas.

### 6.4 Service role

- [ ] Marcar módulos privilegiados como server-only.
- [ ] Auditar cada uso de `createAdminClient`.
- [ ] Exigir validação de tenant e recurso antes de cada mutação.
- [ ] Adicionar logs de auditoria sem payload sensível.
- [ ] Garantir que bundle do navegador não contém secrets.

Critério de aceite:

- Testes automatizados provam isolamento entre dois clientes.
- Perfil inativo não acessa nenhuma rota ou ação protegida.

### 6.5 Lote 1 revisado - estado em 05/10/2026

Implementado somente na branch `codex/lote-1-autorizacao-workflows`:

- [x] Criar DAL central de autorização por perfil, papel, tenant, status da
  empresa e tipo de operação.
- [x] Exigir `requireLexiaAdmin()` para criar ou editar workflows.
- [x] Manter cliente limitado ao dispatch server-side autorizado.
- [x] Exigir admin Lexia e empresa ativa em ambos os limites do dispatch
  `painel_admin`, antes de consultar sessão/workflow ou chamar webhook.
- [x] Retirar `webhook_url` das props e DTOs de cliente e admin.
- [x] Validar HTTPS e allowlist privada de hosts antes de salvar ou disparar.
- [x] Preparar corte de grants por coluna sem manter SELECT amplo da tabela.
- [x] Preservar leitura histórica do admin e bloquear empresa inativa para o
  cliente e para novas operações.
- [x] Manter pausa administrativa como contenção disponível em empresa
  inativa e bloquear retomada.
- [x] Recriar policies do Analista e ajustes preservando dono, sessão e tenant.
- [x] Tornar callback final transacional, imutável e idempotente.
- [x] Unir dentro do lock os claims de ferramenta persistidos com o callback e
  manter execução e metadata da resposta coerentes sob concorrência.
- [x] Bloquear claim de ferramenta depois da finalização.
- [x] Registrar falha de vínculo Auth como pendência recuperável, sem apagar ou
  reassociar usuário.
- [x] Preparar índice único concorrente com preflight e recuperação explícita.
- [x] Vincular scripts de teste e índice ao `project_ref` real, proteger o ref
  de produção e validar marcador remoto antes de qualquer escrita isolada.
- [x] Criar testes comportamentais/de contrato e suite mínima isolada de
  banco.
- [x] Incluir `npm test` no CI.
- [x] Versionar baseline mínimo exclusivo para reconstrução do ambiente
  descartável e documentar falhas de limpeza separadamente.
- [x] Fazer a policy isolada de `lexia_clientes` delegar diretamente a
  `lexia_user_can_access_cliente`, validando helper e policy no mesmo fluxo.
- [x] Separar formalmente a suite mínima de banco dos smoke tests da aplicação
  completa.
- [x] Permitir Session pooler somente no alvo `isolated_test`, vinculando host,
  usuário e ref esperados, recusando porta `6543` e mantendo TLS
  `verify-full`; staging e produção continuam fora dessa exceção.
- [x] Separar um check de conectividade/autenticação com `psql` que encerra com
  `\q` e não executa SQL.
- [x] Fixar o Session pooler à CA pública oficial do Supabase e conferir seu
  subject/fingerprint antes da conexão.
- [x] Documentar implantação e recuperação em
  `docs/LOTE_1_AUTORIZACAO_WORKFLOWS.md`.

Validação e aplicação:

- [x] Projeto Supabase descartável `ghwinxmpwqkvqpfkmyve` identificado,
  migrado até a `003`, verificado e aprovado pela suite mínima de banco; a
  limpeza deixou zero usuários e registros sintéticos.
- [x] Versionar um schema adicional, manifesto de limpeza, receptor HTTPS
  falso em loopback e runner Next para o ensaio selecionado de runtime.
- [x] Remover as duas invalidacoes de `updateClientSettings` e atualizar a
  rota no cliente uma unica vez por token de sucesso. O ensaio confirmou zero
  refresh em erro, um refresh por sucesso, duas edicoes consecutivas, mensagem
  preservada, botao pronto e dados atuais ao voltar/avancar.
- [x] Validar no runtime descartavel cadastro, atualizacao de destino,
  dispatch admin/cliente, bloqueio da superficie administrativa ao cliente,
  callbacks autenticados/idempotentes e auditoria de exposicao no navegador.
- [ ] Criar backup do banco central e comprovar restauração em outro ambiente.
- [ ] Identificar consumidor externo de `lexia_buscar_ajustes_agente` antes de
  alterar seus privilégios ou `search_path`.
- [ ] Identificar consumidor de `site_feedback` antes de restringir a
  submissão pública.
- [ ] Configurar `LEXIA_WORKFLOW_ALLOWED_HOSTS` em staging.
- [ ] Executar preflight e índice concorrente em staging.
- [ ] Aplicar a migration de expansão, publicar preview compatível e somente
  depois aplicar a migration de corte de grants; antes do corte executar apenas
  compatibilidade da aplicação, e depois dele executar a suite completa.
- [ ] Obter nova aprovação antes de qualquer mudança em produção.

Regra de recuperação: depois do corte de grants, corrigir para frente ou voltar
para uma versão compatível com o DAL privado. Nunca restaurar SELECT amplo,
escrita de `authenticated` ou acesso direto a `webhook_url` como rollback.

## 7. P1 - Mensagens Fiéis aos Canais

Esta fase é necessária para cumprir o objetivo de “espelho do WhatsApp”. Ajustar apenas CSS não resolve o problema de dados.

### 7.1 Novo contrato de evento

Projetar migration para incluir, após validação:

- [ ] `canal` na mensagem ou relação inequívoca com contacto.
- [ ] `provider_message_id`.
- [ ] `provider_timestamp`.
- [ ] `provider_sequence` quando disponível.
- [ ] `reply_to_provider_message_id`.
- [ ] `delivery_status`.
- [ ] `media_kind`.
- [ ] `media_url` ou `storage_path` durável.
- [ ] `caption`.
- [ ] `mime_type`.
- [ ] `provider_metadata jsonb` mínimo e com política de retenção.
- [ ] índice único idempotente por cliente/canal/provider ID.

Não armazenar payload bruto indefinidamente sem revisão de privacidade.

### 7.2 Corrigir n8n

- [ ] Inserir uma linha por evento recebido.
- [ ] Inserir uma linha por bolha enviada.
- [ ] Não concatenar mensagens separadas.
- [ ] Preservar timestamp do provedor.
- [ ] Fazer upsert idempotente.
- [ ] Gravar tipo, caption e mídia separadamente.
- [ ] Atualizar `lexia_contactos.atualizado_em`.
- [ ] Gravar intervenção humana com origem correta.
- [ ] Gravar follow-up com origem correta.
- [ ] Capturar eventos de eco/saída de mensagens enviadas fora do fluxo automático.
- [ ] Tratar evento fora de ordem.
- [ ] Tratar retry sem duplicar.

### 7.3 Mídia

- [ ] Decidir se a Lexia copiará mídia para Supabase Storage.
- [ ] Definir retenção e autorização de URLs assinadas.
- [ ] Evitar depender de URLs `.enc` temporárias da Meta.
- [ ] Renderizar imagem, vídeo, áudio, documento e caption.
- [ ] Mostrar estado indisponível sem expor URL técnica ao usuário.

### 7.4 UI

- [ ] Remover split heurístico para dados novos estruturados.
- [ ] Manter compatibilidade legada para dados antigos.
- [ ] Exibir citação/resposta quando houver.
- [ ] Exibir status de entrega se disponível.
- [ ] Criar separação explícita entre eventos antigos inferidos e novos exatos somente se necessário.

### 7.5 Backfill

- [ ] Não inventar IDs ou timestamps históricos.
- [ ] Marcar linhas agregadas como legado.
- [ ] Preservar conteúdo original.
- [ ] Só dividir visualmente quando a heurística for segura.

Critério de aceite:

- Uma sequência de teste no WhatsApp aparece com o mesmo número de bolhas, ordem, direção, texto, mídia e timestamps relevantes.
- Retry do webhook não duplica mensagem.
- Eventos com mesmo segundo mantêm ordem determinística do provedor.

## 8. P1 - Métricas Confiáveis

### 8.1 Dicionário de métricas

- [ ] Transformar as definições de `Agent.MD` em documento de produto versionado.
- [ ] Nomear owner de cada métrica.
- [ ] Definir fonte, fórmula, janela, fuso, exclusões e limitações.
- [ ] Exibir “última atualização” no dashboard.
- [ ] Exibir indisponibilidade em vez de zero em falhas de integração.

### 8.2 Testes de métricas

Criar fixtures para:

- [ ] conversa iniciada antes e ativa dentro do período;
- [ ] período maior nunca reduzir conversa iniciada por erro de consulta;
- [ ] mensagens com timestamps iguais;
- [ ] conversa sem contacto;
- [ ] contacto sem mensagem;
- [ ] test conversation `teste:%`;
- [ ] intervenção `humano`;
- [ ] intervenção `painel_cliente`;
- [ ] mensagem `recebida_na_pausa`;
- [ ] follow-up rápido respondido antes e depois do fim do período, com expectativa de janela explícita;
- [ ] follow-up normal;
- [ ] horários na mudança de DST de Lisboa e New York;
- [ ] agendamento `confirmado` Miranda;
- [ ] agendamento `confirmada` e `pendente_sinal` Detail;
- [ ] resposta acima de 1 hora;
- [ ] filtro de canal sem atribuição de agendamento.

### 8.3 Auditoria contra SQL

- [ ] Criar consultas SQL independentes para cada métrica.
- [ ] Comparar dashboard e SQL em Hoje, Semana, Mês e intervalo customizado.
- [ ] Comparar Miranda e Detail.
- [ ] Registrar amostras esperadas e data da auditoria.

### 8.4 Anúncios

- [ ] Alterar n8n para gravar marcador explícito de lead de anúncio.
- [ ] Definir ID de campanha, conjunto e anúncio quando disponível.
- [ ] Só então criar “leads de anúncio” e “anúncio para agendamento”.
- [ ] Manter `followup_rapido` rotulado apenas como recuperação de follow-up.

### 8.5 Follow-up respondido

- [ ] Definir se resposta deve ocorrer em qualquer data ou dentro da janela.
- [ ] Definir janela de atribuição.
- [ ] Diferenciar `followup_agente` e `followup_rapido`.
- [ ] Evitar dupla contagem em múltiplos follow-ups.

Critério de aceite:

- Cada cartão possui teste automatizado e consulta de auditoria.
- Os mesmos dados geram o mesmo número independentemente da página admin ou cliente.

## 9. P1 - Performance do Dashboard

Mitigação aplicada em 30/09/2026: o dashboard passou a buscar somente mensagens do período. Para preservar a fórmula de conversas iniciadas, faz uma segunda busca leve apenas por entradas anteriores das conversas candidatas. Autenticação/perfil são memoizados dentro da requisição, consultas independentes rodam em paralelo e os Supabase externos selecionam apenas as colunas necessárias.

Validação em Production em 30/09/2026: build e typecheck da Vercel aprovados; `/app` e `/app/conversas` autenticados responderam HTTP 200, com aproximadamente 1,2 s e 1,1 s de tempo total após aquecimento.

Risco restante: a agregação ainda ocorre no servidor Next.js e o desempenho depende dos índices remotos. A solução de longo prazo continua sendo uma view/RPC ou tabela incremental auditada contra as fórmulas atuais.

### Plano

- [-] Medir tempo, linhas lidas e memória por página. O volume central foi medido, mas falta instrumentação contínua em produção.
- [ ] Criar índice para `cliente_slug, identificador_conversa, criado_em`.
- [ ] Criar índice para `cliente_slug, criado_em`.
- [ ] Verificar índices de `contactos`, `feedbacks` e `handoffs`.
- [x] Parar de transferir todo o histórico para identificar a primeira mensagem; a verificação atual consulta apenas as candidatas do período.
- [ ] Avaliar view/RPC para primeira mensagem recebida.
- [ ] Avaliar tabela agregada incremental por conversa.
- [ ] Calcular métricas no Postgres em vez de transferir todo o histórico.
- [ ] Manter a fórmula e o fuso idênticos.
- [ ] Adicionar cache curto somente depois de garantir invalidação.
- [x] Executar consultas independentes do dashboard e das métricas externas em paralelo.
- [x] Paginar consultas acima de 1.000 linhas em lotes concorrentes de quatro páginas, preservando a ordem dos resultados.
- [x] Memoizar usuário/perfil por requisição com `React.cache`.
- [x] Pré-carregar em paralelo o histórico da conversa explicitamente selecionada.

Critério de aceite:

- Dashboard mantém tempo de resposta previsível com volume 10 vezes maior.
- Resultado permanece idêntico às fixtures.

## 10. P1 - Integrações de Cliente Configuráveis

Problema atual: novo Supabase de métricas exige alteração em `clientConfigs` e deploy.

### Modelo proposto

- [ ] Criar tabela central de configuração de métricas.
- [ ] Armazenar somente referência do segredo, nunca service role em texto aberto no banco acessível à UI.
- [ ] Definir `cliente_slug`, timezone, provider, tabela, colunas e status permitidos.
- [ ] Validar nomes de tabela/coluna por allowlist para evitar consulta arbitrária.
- [ ] Criar adaptadores tipados por modelo conhecido.
- [ ] Criar teste de conexão no admin.
- [ ] Mostrar estado da integração e último erro sem revelar segredo.
- [ ] Manter fallback seguro para cliente sem agendamentos.

Critério de aceite:

- Novo cliente compatível é conectado sem alterar código de página.
- Um erro em um cliente não derruba dashboard de outros.

## 11. P1 - Workflows e Área de Testes

### Gestão de múltiplos workflows

- [ ] Tela para listar, criar, editar, ativar e desativar cada workflow.
- [ ] Um workflow por canal/uso claramente rotulado.
- [ ] Diferenciar produção e teste sem depender apenas do nome.
- [ ] Evitar dois workflows ativos ambíguos para a mesma função.
- [ ] Validar URL HTTPS.
- [ ] Definir allowlist de host ou assinatura de webhook.

### Robustez da chamada

- [ ] Envolver `fetch` em `try/catch`.
- [ ] Adicionar `AbortSignal.timeout` compatível.
- [ ] Registrar duração e status sem logar payload sensível.
- [ ] Mostrar erro de rede distinto de HTTP não 2xx.
- [ ] Definir retry seguro.
- [ ] Assinar o payload entre Vercel e n8n.

### Execuções

- [ ] Índice/unique para `run_id` por cliente.
- [ ] Estado `pendente`, `sucesso`, `erro`, `timeout` explícito.
- [ ] Limpeza por retenção, não apenas manual.
- [ ] Redação de dados sensíveis nos campos raw.

Critério de aceite:

- Uma falha de webhook termina com mensagem clara e log correlacionável.
- Um run ID não gera duas execuções.

## 12. P1 - Usuários e Administração

- [ ] Linkar gestão de clientes na navegação admin.
- [ ] Linkar execuções e ajustes onde fizer sentido.
- [ ] Permitir alterar role com validação.
- [ ] Permitir redefinir senha por fluxo seguro do Supabase.
- [ ] Implementar remoção/desativação coordenada entre Auth e perfil.
- [ ] Fazer rollback do Auth se a criação do vínculo falhar.
- [ ] Exibir e-mail no admin por API server-side autorizada, sem expor lista ao cliente.
- [ ] Registrar auditoria de criação, status e role.
- [ ] Definir diferenças reais entre `cliente_admin` e `cliente_operador`.

Critério de aceite:

- Não existem usuários Auth órfãos após falha simulada.
- Operador não executa ações reservadas ao admin do cliente.

## 13. P1 - Observabilidade e Operação

### Logs

- [ ] Adotar logger estruturado.
- [ ] Correlation ID por request, sessão de teste e run ID.
- [ ] Não logar webhook URL, senha, token, telefone completo ou conteúdo sem necessidade.
- [ ] Redigir PII.

### Monitoramento

- [ ] Alertar erro 5xx Vercel.
- [ ] Alertar falha de consulta Supabase externo.
- [ ] Alertar ausência inesperada de mensagens por cliente/canal.
- [ ] Alertar execução de teste em timeout.
- [ ] Monitorar latência do dashboard.
- [ ] Monitorar volume de linhas e storage.

### Health checks

- [ ] Health interno sem secrets.
- [ ] Checagem central.
- [ ] Checagem por integração externa.
- [ ] Checagem de atraso da última mensagem por canal.

Critério de aceite:

- Falhas críticas geram alerta antes de o cliente reportar.

## 14. P1 - CI/CD

- [x] Workflow de CI em pull request preparado na branch do Lote 1.
- [x] `npm ci`.
- [x] Lint.
- [x] Typecheck.
- [x] Unit tests com `npm test`.
- [x] Build.
- [x] Audit informativo, sem bloquear merge, enquanto as vulnerabilidades
  conhecidas não são tratadas em lote próprio.
- [ ] E2E em Preview com banco de teste.
- [ ] Proteção de branch.
- [ ] Deploy Production somente após aprovação.
- [ ] Migração antes do código somente quando backward compatible.
- [ ] Rollback documentado por release.

Critério de aceite:

- Nenhum deploy manual pula validações mínimas.

## 15. P2 - Qualidade de Código

### Duplicação admin/cliente

- [ ] Extrair loader compartilhado de conversas com política de escopo injetada.
- [ ] Extrair layout compartilhado sem misturar autorização.
- [ ] Compartilhar componentes de dashboard.
- [ ] Manter ações separadas quando a autorização for diferente.

### Tipos do banco

- [ ] Gerar tipos Supabase a partir do schema versionado.
- [ ] Substituir casts manuais progressivamente.
- [ ] Tipar enums de status/origem em módulo central.
- [ ] Validar payload externo em runtime.

### Erros e carregamento

- [ ] Adicionar `error.tsx` apropriado.
- [ ] Adicionar `loading.tsx` nas rotas pesadas.
- [ ] Evitar mensagens genéricas quando houver ação de recuperação.
- [ ] Criar estados vazios consistentes.

## 16. P2 - Experiência de Conversa

- [x] Workspace compacto em desktop e conversa em tela cheia no mobile, priorizando a quantidade de mensagens visíveis.
- [x] Caixa de entrada unificada, filtros recolhidos, período histórico completo e busca global por nome ou telefone.
- [ ] Busca por conteúdo das mensagens.
- [ ] Paginação virtual/cursor na lista lateral.
- [ ] Carregamento incremental para conversas muito longas.
- [ ] Preservar posição ao carregar histórico anterior.
- [ ] Indicador de origem humana/automática apenas quando útil.
- [ ] Player de áudio consistente.
- [ ] Preview seguro de documentos.
- [ ] Atalho para conversa a partir de feedback/handoff.
- [ ] Estado “novas mensagens” sem deslocar a leitura.
- [ ] Atualização em tempo real ou polling controlado.

## 17. P2 - Dashboard de Produto

- [ ] Comparação com período anterior.
- [ ] Tendências diárias.
- [ ] Estado de atualização de cada fonte.
- [ ] Export CSV com escopo autorizado.
- [ ] Drill-down do cartão para conversas que compõem a métrica.
- [ ] Atribuição de agendamento somente após chave confiável conversa-cliente.
- [ ] Definição de metas por cliente.
- [ ] Não criar métrica “bonita” sem fonte auditável.

## 18. P2 - Backups, Retenção e Privacidade

- [ ] Definir RPO e RTO.
- [ ] Backup automático do Supabase central.
- [ ] Backup dos bancos externos sob responsabilidade definida.
- [ ] Teste de restauração trimestral.
- [ ] Retenção de mensagens, execuções raw e mídia.
- [ ] Processo de exclusão por solicitação de titular.
- [ ] Minimização de PII em logs e analytics.
- [ ] Política para dados de teste.
- [ ] Documentar região e subprocessadores.

## 19. Ordem Recomendada de Execução

### Semana 1: sobrevivência

1. Versionar e criar remote.
2. Rotacionar segredos.
3. Atualizar dependências críticas.
4. Exportar banco/RLS/n8n.
5. Criar baseline de build.

### Semana 2: confiança

1. Testes das métricas.
2. Status/RLS e sessão.
3. CI.
4. Observabilidade mínima.

### Semanas 3 e 4: fidelidade das mensagens

1. Schema novo compatível.
2. n8n idempotente por evento.
3. Mídia durável.
4. Renderer estruturado.
5. Teste comparativo com WhatsApp/Instagram/Messenger.

### Mês 2: escala

1. Métricas em SQL/RPC.
2. Integração externa configurável.
3. Gestão de múltiplos workflows.
4. Gestão completa de usuários.
5. Paginação e tempo real.

## 20. Matriz de Regressão Obrigatória

| Mudança | Validar obrigatoriamente |
| --- | --- |
| Auth/perfil | admin, cliente ativo, inativo, sem perfil, outro tenant |
| RLS/schema central | todas as rotas cliente e ações service role |
| Conversas | 3 canais, ordem, direção, mídia, período, histórico completo |
| Datas/fuso | São Paulo, Lisboa, New York, DST e fim inclusivo |
| Métricas | fixture, SQL de auditoria, admin e cliente |
| Agendamentos | Miranda confirmado; Detail confirmada e pendente_sinal |
| Follow-up | agente, rápido, resposta posterior e não anúncio |
| Workflow | cliente/admin, múltiplos ativos, timeout e erro HTTP |
| Exclusão | dois tenants, feedback, execução, sessão, mensagem e contacto |
| UI global | desktop, mobile, texto longo, estados vazios e erro |
| Analista Lexia | admin, dois clientes, isolamento, período/canal, cobertura, fontes, rate limit e ausência de PII enviada ao modelo |

## 21. Plano de Rollback de Release

Antes de cada release:

- [ ] Tag/commit exato da versão anterior.
- [ ] Backup antes de migration.
- [ ] Migration backward compatible sempre que possível.
- [ ] Feature flag para mudanças de ingestão/métricas de alto risco.
- [ ] Capacidade de reativar workflow n8n anterior.
- [ ] Lista de envs alteradas.

Se houver incidente:

1. Interromper novos deploys.
2. Identificar se é código, banco, env ou n8n.
3. Reverter deployment na Vercel se for código.
4. Reativar workflow anterior se for ingestão.
5. Não reverter migration destrutiva sem backup validado.
6. Preservar logs e IDs de correlação.
7. Corrigir e executar matriz de regressão.
8. Registrar causa e prevenção.

## 22. Decisões que Exigem Aprovação de Produto

- Alterar definição de qualquer métrica.
- Alterar janela de follow-up recuperado.
- Contar agendamento pela data marcada em vez de `criado_em`.
- Diferenciar permissões entre admin e operador do cliente.
- Exibir origem técnica ao cliente.
- Retenção e armazenamento de mídia.
- Exibir dados históricos de autonomia anteriores a agosto de 2026.
- Criar atribuição de anúncio ou conversão individual.
- Mudar identidade visual global da Lexia.

## 23. Dívidas que Não Devem Ser “Corrigidas” no Escuro

- Não dividir toda mensagem por linha em branco.
- Não ordenar mensagens apenas por UUID.
- Não assumir que contacto e telefone são sempre a mesma pessoa.
- Não unir agendamento e conversa apenas por telefone sem normalização e regras de canal.
- Não mostrar zero quando uma fonte externa falhou.
- Não remover a busca de histórico anterior ao período sem substituir a lógica de primeira mensagem.
- Não usar `followup_rapido` como marcador de anúncio.
- Não mover service role para o cliente para contornar RLS.
- Não editar diretamente produção sem migration e backup.

## 24. Encerramento de Cada Fase

Ao concluir uma fase:

- [ ] Atualizar caixas deste plano.
- [ ] Atualizar o estado atual em `Agent.MD`.
- [ ] Registrar comandos e resultados de validação.
- [ ] Registrar migrations e rollback.
- [ ] Registrar deploy e URL.
- [ ] Confirmar que nenhum segredo foi incluído.
- [ ] Criar tag/release quando apropriado.

O plano só deve ser marcado como concluído quando a produção estiver verificada, não apenas quando o código estiver escrito.

## 25. P1 - Analista Lexia

### Implementação concluída no código

- [x] Criar `/app/analista` e `/admin/analista` com seleção de cliente apenas para admin.
- [x] Resolver usuário, status, role, tenant, canal, fuso e período novamente no servidor.
- [x] Reutilizar métricas determinísticas existentes em vez de pedir números ao modelo.
- [x] Criar ferramentas fechadas para desempenho, objeções, qualidade, busca, conversa e feedbacks.
- [x] Criar fontes clicáveis para as conversas autorizadas.
- [x] Redigir e-mail, telefone e URL; substituir identificadores reais por referências opacas no contexto do chat.
- [x] Transformar a pergunta em execução assíncrona auditável com status `iniciada`, `concluida` ou `erro`.
- [x] Despachar para o n8n com timeout curto, autenticação Bearer e HTTP 202 para o navegador.
- [x] Criar API server-to-server de ferramentas sem SQL arbitrário, `service_role`, Redis ou mutações operacionais.
- [x] Entregar conversas ao n8n em lotes de até quatro, com referências opacas e conteúdo redigido.
- [x] Criar callback assinado, validação de fontes e mensagem idempotente por execução.
- [x] Criar polling de status e retomada automática de execução pendente ao abrir uma sessão.
- [x] Encerrar como erro execuções abertas por mais de dez minutos.
- [x] Tornar o parser do navegador resiliente a respostas não JSON.
- [x] Limitar chat a 12 perguntas por usuário a cada cinco minutos.
- [x] Versionar migration, RLS restritiva e rollback destrutivo documentado.
- [x] Documentar o projeto e o workflow em `docs/LEXIA_CRM_E_ANALISTA_N8N.md`.
- [-] Manter temporariamente a classificação OpenAI direta e seus endpoints como rollback legado.

### Ativação pendente

- [ ] Fazer backup do Supabase central.
- [x] Aplicar `supabase/migrations/202609220001_lexia_ai_analyst.sql`.
- [ ] Criar credencial Header Auth do Analista no n8n.
- [ ] Construir e publicar o workflow com `Respond = Immediately`.
- [ ] Configurar `LEXIA_APP_URL`, `N8N_ANALYST_WEBHOOK_URL` e `N8N_ANALYST_WEBHOOK_SECRET` na Vercel.
- [ ] Fazer deploy da versão n8n.
- [ ] Validar pergunta quantitativa da Miranda contra o dashboard.
- [ ] Validar objeções, qualidade, cobertura e fontes da Miranda.
- [ ] Repetir com Detail e provar que nenhum dado cruza tenants.
- [ ] Validar callback repetido, reload durante processamento, timeout e falha do workflow.
- [ ] Validar rate limit e mensagens de configuração ausente.
- [ ] Conferir duração, ferramentas, tokens e falhas em `lexia_ai_execucoes`.
- [ ] Validar TypeScript, ESLint e build numa cópia limpa fora do iCloud após a documentação final.

### Próximas fases

- [ ] Adicionar chave idempotente ao disparo inicial da pergunta.
- [ ] Evoluir o segredo compartilhado para assinatura HMAC com timestamp e proteção contra replay.
- [ ] Criar monitor para execuções presas sem depender do polling do usuário.
- [ ] Definir orçamento por cliente, limite mensal e alerta de custo.
- [ ] Definir retenção/exclusão de sessões, execuções e insights.
- [ ] Criar conjunto de avaliação com conversas revisadas por humano para medir precisão de objeções e recomendações.
- [ ] Avaliar embeddings e pgvector somente depois do baseline; manter busca lexical até provar ganho.
- [ ] Adicionar streaming da resposta sem perder auditoria e fontes.
- [ ] Adicionar testes automatizados de isolamento, ferramentas, callback e timeout.
- [ ] Remover o fluxo OpenAI direto somente após rollback e produção n8n serem validados.

Critério de aceite da V1:

- Um cliente ativo obtém números iguais ao dashboard para o mesmo período e canal.
- Perguntas qualitativas deixam claro o tamanho e a cobertura da amostra.
- Toda evidência exibida abre uma conversa do próprio tenant.
- Nenhuma ferramenta pode escrever em mensagens, agente, Redis ou integrações.
- Admin não herda silenciosamente o tenant anterior; a seleção é explícita.
- Falha do n8n, modelo ou fonte gera erro auditável sem vazar segredo ou conteúdo bruto em log.
- Recarregar a página durante uma análise retoma a execução sem duplicar resposta.
- Retry do callback é idempotente.

Rollback:

1. Reverter o deployment para o fluxo anterior e despublicar o workflow novo.
2. Preservar as quatro tabelas e o histórico de execução.
3. Remover variáveis n8n somente depois de confirmar o rollback.
4. Executar o rollback SQL destrutivo apenas após export e decisão explícita de apagar o histórico.
