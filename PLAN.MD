# Plano de Estabilização e Evolução da Lexia CRM

## Memoria Central E Primeiro Ensaio Real (12/10/2026)

- [x] Autorizar memoria operacional central e catalogo Miranda somente GET.
- [x] Backup central/HML; validar dependencias com rollback e aplicar no central.
- [x] Criar configuracao Miranda virtual, politica aprovada e prompt versionado.
- [x] Adaptar quatro nodes de memoria do 02; manter inteligencia/grafo/layout.
- [x] Habilitar apenas 01/02 para texto virtual no CRM HML, sem Google/provedor.
- [x] Corrigir consultas, filtros AND de contexto, identidades de resumo,
  selecao do resumo atual e persistencia/recibo virtual; criar regressoes.
- [x] Ensaio real PT -> ES sem reapresentacao; burst de duas mensagens num lote.
- [x] 295 + 193 testes JS/TS, 9 Python, lint/typecheck; 41 consultas preparadas;
  8 assercoes SQL de isolamento/CAS/cache com rollback.
- [ ] Revisar respostas comerciais/clinicas e ampliar roteiro PT/EN/ES.
- [ ] Instalar/homologar hooks e DocTypes HML de comandos, pipeline e agenda.
- [ ] Habilitar disponibilidade no calendario proprio; depois escrita/cancelamento.
- [ ] Homologar 03/04 e timeline/pipeline; depois canais de teste separadamente.
- [ ] Gerar imagem HML com fontes revisadas antes de nova recriacao por imagem.
- [ ] Ensaiar restauracao dos backups; apenas integridade/indice conferidos agora.

As copias 01/02 estao publicadas; os JSONs portaveis continuam inativos e com
flags em branco/false. Nao reimportar por cima das copias ja configuradas.
Estado/evidencias: docs/MIRANDA_MEMORIA_CENTRAL_CRM_20261012.md.
O checklist abaixo e historico da auditoria ANTERIOR a essa autorizacao.

## Auditoria do Primeiro Chat 01 + 02 (12/10/2026)

- [x] Conferir metadados reais do central e HML em transacoes somente leitura.
- [x] Conferir seis copias inativas pelo plugin; preservar alteracoes do usuario.
- [x] Corrigir somente Header Auth do teste e ID do 02 no rascunho 01.
- [x] Preparar configuracao Frappe/readiness e corrigir geracao do SQL 001.
- [ ] Confirmar memoria operacional central e origem isolada do catalogo.
- [ ] Revisar/aprovar/aplicar dependencias aditivas com backup, sem bootstrap.
- [ ] Preparar tenant/conta fake/politica/prompt versionado e completar Sets.
- [ ] Instalar compatibilidade HML e mudar alvo; homologar primeiro texto.

Nenhum workflow/modelo/canal foi executado; nenhum SQL aplicado ou servico
reiniciado. Relatorio: docs/MIRANDA_CRM_AUDITORIA_PREPARACAO_20261012.md.

## Layout Original Restaurado (12/10/2026)

- [x] Restaurar coordenadas exatas dos 138 nodes originais mantidos nos seis.
- [x] Organizar extensoes horizontalmente e recuperar secoes sem texto secreto.
- [x] Provar invariancia de codigo/conexoes/credenciais/flags e ausencia de
  sobreposicoes entre nodes e entre caixas de secao; layout deterministico.
- [x] Conferir seis diagramas locais; 285 testes, lint e typecheck passaram.
- [ ] Conferir o canvas importado pelo usuario no n8n real, sem substituir
  qualquer workflow ativo da Miranda. Loops/tools mantem seus fios originais.

Somente arquivos locais, mesmos nomes. Nenhum SQL/servico/workflow executado;
pendencias funcionais anteriores permanecem. Leia README do pacote.

## Seis Arquivos: Controles Ligados Localmente (12/10/2026)

- [x] Ligar comandos autenticados e cancelamento com recibo duravel no Omnichannel.
- [x] Projetar snapshot Redis por versao antes do processamento e da entrega.
- [x] Adicionar manutencao inativa e outbox CRM com claim/recibo vinculado.
- [x] Preservar identidades de mensagens, enriquecimento e bloqueios no Frappe.
- [x] Reutilizar o agendamento original do follow-up, com fila escopada central.
- [x] Encerrar fila em resposta nova/agendamento sem apagar historico de conversao.
- [x] Preparar notificacoes Z-API/UAZAPI com claim, sem reenvio incerto.
- [x] Vincular confirmacao terminal ao create real e preservar demais pausas.
- [x] Preparar dispatcher e pipeline nativos do Frappe, desligados e nao instalados.
- [ ] Revisar/aplicar dependencias e configurar aliases/credenciais/test target.
- [ ] Homologar os seis no n8n/CRM/Google com dados ficticios e calendario proprio.
- [ ] Fechar answer_pending automatico, lotes claimed interrompidos, contatos
  operacionais/rapido e atribuicao duravel antes da migracao de canais reais.
- [ ] Adaptar ingresso assinado e entrega Meta; graduar contratos para producao.

Os checks locais nao sao evidencias de SQL aplicado ou integracao real. Reusar
os mesmos seis nomes, nao importar variantes adicionais. Producao intocada.

## Base Unica Para Migracao Miranda (12/10/2026)

- [x] Conferir ZIP atualizado, seis workflows e diferencas sem copiar segredos.
- [x] Confirmar central compartilhado persistente + bancos privados por cliente.
- [x] Confirmar 15 min humana; aguardar nova mensagem; agendamento ate ends_at.
- [x] Confirmar cancelamento Frappe tambem no Google, com resultado atestado.
- [x] Confirmar handoff normal sem pausa; alta/urgente com resolucao e retomada.
- [x] Confirmar Z-API no handoff e UAZAPI no agendamento para Samuel/socio.
- [x] Autorizar preparo local de SQL/Frappe, sem instalacao/servicos/publicacao.
- [x] Gerar primeira revisao de seis JSONs a partir do ZIP atualizado; retirar
  legado desconectado, conferir sintaxe/refs/posicoes e listar lacunas no manifesto.
- [x] Preparar wrapper SQL de handoff por prioridade, cancelamento solicitado
  separado da pausa, claim Google e outbox CRM com recibo ligado ao evento.
- [x] Preparar ajuste Frappe local de handoff normal sem bloqueio e helper puro
  de recuperacao/conversao de follow-up, sem instalar ou habilitar o pipeline.
- [ ] Adaptar nova base de seis originais, preservando negocio e simplificando
  somente repeticao de controle, sem mascarar dependencias ausentes.
- [ ] Atualizar contrato/schema/UI para handoff normal sem bloqueio e cancelamento
  solicitado/confirmado/incerto; proteger recursos persistentes contra limpeza.
- [ ] Integrar outbox CRM, entrega comum, pipeline e ciclo/atribuicao de follow-up.
- [ ] Gerar seis JSONs inativos legiveis; comparar negocios e testar regressoes.
- [ ] Homologar dependencias/canais/tools separadamente antes de corte aprovado.

Mapa: docs/MIRANDA_MIGRACAO_BASE_PRODUCAO_20261012.md e
n8n/miranda-migration-review/README.md. Candidatos locais nao substituem o
pacote final integrado: nao ativar. Nenhum SQL/servico/workflow foi executado.

## Primeiro Google Pessoal: Leitura (12/10/2026)

- [x] Simplificar disponibilidade de 26 para 17 nodes sem alterar calculos.
- [x] Manter identidade/escopo/bloqueios/versao/lote/calendario protegido no SELECT.
- [x] Permitir ID pessoal exato somente para leitura explicitamente autorizada.
- [x] Gerar cerebro sem tool de criacao e omnichannel com politica read-only.
- [x] Configurar CRM HML server-side; validar politica/retorno sem escrita.
- [x] Backup, fonte persistida, reload somente Frappe HML; nenhum n8n alterado.
- [x] 208 combinados, 193 Lote 2, lint/typecheck; 15 testes Frappe HML.
- [ ] Conectar OAuth pessoal, importar/vincular copias e conferir memoria HML.
- [ ] Homologar preflight SQL/nodes nativos/Google/encadeamento real no CRM.
- [ ] Incorporar alteracao Python na proxima imagem Frappe antes de recriar.
- [ ] Nova aprovacao/ledger atestado antes de criar eventos ou ligar canais.

Guia: n8n/miranda-original-crm/AGENDA_SOMENTE_LEITURA.md. Sem novo SQL,
publicacao/importacao n8n ou alteracao da Miranda de producao.

## Tools Originais: Rodada Local (12/10/2026)

- [x] Preservar nomes/logica das duas tools e gerar novas copias inativas.
- [x] Usar nodes nativos, calendario secundario e credenciais somente por nome.
- [x] Proteger aliases/calendario originais e separar leitura de escrita.
- [x] Implementar recibos tipados e reserva de escrita sem liberacao cega por prazo.
- [x] Reconsultar duplicidade/ocupacao apos claim, revalidar antes do Google.
- [x] Preservar regras Miranda/idioma/variantes; corrigir alternativas de conflito.
- [x] Preparar SQL isolado em arquivo; nenhuma aplicacao/conexao realizada.
- [x] 38 testes novos; 70 direcionados; 201 combinados; 193 Lote 2; lint/typecheck.
- [ ] Revisar/aprovar e aplicar schema HML separadamente, nunca em producao.
- [ ] Configurar OAuth pessoal/calendario secundario e importar manualmente.
- [ ] Habilitar politica de agenda de teste no corredor CRM/Omnichannel e
  declarar corretamente efeitos reais de teste na UI/retorno.
- [ ] Consumir eventos no mestre, incluindo confirmacao terminal/pausa/outbox.
- [ ] Homologar OAuth/SQL/nodes reais/concorrencia e recuperacao de unknown.
- [ ] Revisar os 15 advisories da arvore npm local separadamente; Luxon nao
  possui advisory no audit desta rodada. Nao foi aplicado audit fix.

Runbook: `n8n/miranda-original-crm/TOOLS_AGENDA.md`. Sem acesso remoto, SQL,
importacao/ativacao, edicao da Miranda, commit, push, merge ou deploy.

## Cerebro Original: Rodada Local (12/10/2026)

- [x] Gerar copia inativa a partir do cerebro original, preservando inteligencia.
- [x] Isolar chamada/historico/memoria por escopo, com CAS e duplicacao conhecida.
- [x] Melhorar idioma, continuidade, notas do redator e baloes sem cortar fatos.
- [x] Validar recibos reais de tools; remover pausa/notificacao direta do cerebro.
- [x] 32/32 regressoes novas, 163/163 combinadas e 193/193 Lote 2 via CLI.
- [x] Lint sem erros/avisos e typecheck CLI; export final pelo gerador habitual.
- [ ] Configurar modelos, catalogo/playbook e projeto privado descartavel.
- [ ] Revisar/criar identidade e memoria privadas; nao houve SQL nesta rodada.
- [ ] Adaptar tools isoladas a recibos provisorios/idempotencia/reconciliacao.
- [ ] Fazer Omnichannel persistir novos eventos antes de entrega/pipeline.
- [ ] Homologar idioma, historico e agenda no CRM com modelo real isolado.

Importacao manual pelo usuario. Nenhum workflow remoto foi modificado/importado
ou ativado nesta rodada; Miranda de producao permanece separada. Runbook:
`n8n/miranda-original-crm/CEREBRO.md`.

## Auditoria Remota HML (11/10/2026)

- [x] Revisar somente as tres copias na pasta CRM MIRANDA SKIN.
- [x] Retirar referencias Postgres de producao e vincular credenciais HML.
- [x] Cadastrar Postgres HML com autorizacao; manter SSL seguro.
- [x] Corrigir Header Auth de teste e passthrough das chamadas internas.
- [x] Restringir chamadores da entrega comum as copias autorizadas.
- [x] Corrigir bundles/getters e copia JSON no task runner n8n instalado.
- [x] 131 testes locais especificos, 193 Lote 2, lint focado e typecheck.
- [x] Seis ensaios pinados no n8n, sem SQL/modelo/provedor real.
- [x] Resolver cadeia de confianca TLS Postgres; manter verificacao SSL.
- [x] Validar CA fornecida e handshake TLS/hostname em processo isolado,
  sem senha/SQL; certificado preparado na VPS, compose em uso intacto.
- [x] Aplicar trust store apos aprovacao; sem jobs em andamento na checagem,
  backup restrito, mesma imagem e retorno HTTP 200 do servidor/worker.
- [x] Credencial HML autenticou e leu metadados de schemas via node nativo.
  Isso nao homologa SQL operacional/fixtures/workflows completos.
- [ ] Homologar acesso Postgres e SQL com dados sinteticos, apos identidade.
- [ ] Preparar cerebro privado de teste e revisar tools/calendario isolados.
- [ ] Preparar fila e playbook sinteticos: tabelas legadas nao estao no HML.
- [ ] Conferir conta, politica e prompt central com fixtures reais de teste.
- [ ] Conectar CRM ao webhook homologado e testar chat/buffer/historico.
- [ ] Homologar automacoes, outbox/pipeline e canais de teste separadamente.

Nenhum workflow foi ativado/publicado/editado nesta manutencao TLS.
Somente servidor e worker n8n foram recriados com aprovacao; banco, Redis,
proxy e Frappe nao foram reiniciados. RASTREIO GERADO possui erro preexistente
conferido no node Enviar Texto1; nao foi alterado nesta rodada.
Runbook: `n8n/miranda-original-crm/AUDITORIA_HML.md`.

## Lembretes Originais: Rodada Local (11/10/2026)

- [x] Preservar sete nomes e regras do original; importar inativo/preview.
- [x] Isolar fonte central e idioma por conversa; sem banco/calendario privado.
- [x] Chamar mesmo Omnichannel, revalidando horario/janela/pausas e unicidade.
- [x] Permitir so pausa do proprio agendamento; cancelar lembrete sem mudar pausa.
- [x] Confirmar sent por ledger/mensagem; nao reenviar unknown nem criar pausa eterna.
- [x] 30 novas regressoes, 128 combinados, 193 Lote 2, lint e typecheck.
- [ ] Homologar SQL/node linking/loops no teste; configurar credenciais e alias.
- [ ] Espelhar confirmacao/cancelamento da tool original isolada no central.
- [ ] Integrar disparo/resultados de automacoes em Agent Test e outbox Frappe.
- [ ] Conferir ingresso/entrega Meta e Z-API teste antes de qualquer canal real.

Guia e gates: `n8n/miranda-original-crm/LEMBRETES.md`. Sem servicos, SQL,
importacao/ativacao remota, commit ou deploy nesta rodada.

## Entrega Comum: Rodada Local (11/10/2026)

- [x] Preservar atendimento/buffer/midia/contexto do Omnichannel original.
- [x] Unificar chat e pedidos privados de follow-up/lembrete na mesma faixa,
  sem criar workflow adicional ou mexer em producao.
- [x] Fechar contratos e vincular scope/estado/source/IDs/planos imutaveis.
- [x] Revalidar cada acao; preservar progresso e bloquear retry incerto.
- [x] Preparar nodes Postgres nativos e HTTP para adaptador Z-API de teste.
- [x] Separar virtual de efeitos confirmados/metricas/pipeline.
- [x] 33 novas regressoes, 98 especificos, 193 Lote 2, lint e typecheck.
- [ ] Homologar SQL/transacoes, loops/item linking e autochamada no n8n.
- [ ] Conferir constraints de origem/fila/playbook no projeto descartavel.
- [x] Adaptar produtor original de lembretes localmente (runbook acima).
- [ ] Homologar produtor e criar UI de testes de automacoes.
- [ ] Conferir Z-API/credenciais/respostas; implementar Meta revisado.
- [ ] Integrar recuperacao de claims, outbox CRM e replay sem reenvio ao lead.
- [ ] Integrar pipeline e atribuicao de recuperacao/conversao por ciclo.

Artefatos inativos e passos: `n8n/miranda-original-crm/ENTREGA_COMPARTILHADA.md`.
Nenhum SQL/servico ou workflow remoto executado. Novas automacoes exigem
schema, autoridade e gate explicitos.

## Follow-up Original: Rodada Local (11/10/2026)

- [x] Preservar os 28 nomes e a inteligencia comercial do follow-up original.
- [x] Isolar tenant/conversa; consultar pausas antes dos modelos; fail-closed.
- [x] Preparar eventos de automacao e mensagem somente com prova de envio.
- [x] Testar duplicacao, idioma, pausas, estado obsoleto e envio incerto:
  27 novos testes, 65 especificos combinados, 193 Lote 2 e lint passaram.
- [ ] Conferir nodes, item linking e Luxon na versao n8n instalada.
- [ ] Preparar schema/fila/playbook sinteticos no ambiente isolado, com aprovacao.
- [-] Receptor compartilhado implementado localmente no Omnichannel;
  revalidacao/claim preparados, mas runtime/banco ainda sem homologacao.
- [ ] Conectar verificacao de contato salvo e assets de audio por idioma.
- [ ] Integrar outbox/recovery de CRM, sem repetir entrega ao lead.
- [ ] Aplicar regras Frappe: Em follow-up, recuperado e convertido com evidencias,
  IDs de ciclo e janela de atribuicao aprovada, nao texto livre da IA.

JSON inativo/preview, sem acesso remoto ou alteracao de producao. Limites e
configuracao: `n8n/miranda-original-crm/FOLLOWUP.md`.

## Agent Test Sobre O Original (11/10/2026)

- [x] Corrigir contrato real de entrada/retorno do Frappe e manter sessao.
- [x] Validar escopo e marcadores Supabase/Postgres antes de gravar no teste.
- [x] Desconectar canais reais; separar retorno virtual do espelho operacional.
- [x] Revalidar idioma/estado e devolver falhas sem dados brutos: 38 testes
  especificos passaram, incluindo os validadores puros do Frappe local.
- [ ] Selecionar credenciais e cerebro isolados; revisar tools antes de liberar.
- [ ] Configurar servidor CRM para o novo webhook e conferir execucao n8n.
- [ ] Testar texto/historico/buffer na copia antes de testar midia ou tools.
- [ ] Depois da aprovacao do chat, adaptar follow-up e pipeline automatico.

Artefato/runbook: `n8n/miranda-original-crm/README.md`. Nenhum servico ou
workflow remoto foi alterado nesta entrega.

## Omnichannel Original: Rodada Local (11/10/2026)

- [x] Gerar copia inativa baseada nos 148 nodes originais, sem segredos inline.
- [x] Testar localmente origem do contexto, historico isolado, falha de midia,
  autoria, registro virtual e entrega incerta: 14 regressoes passaram.
- [ ] Conferir importacao e parametros dos nodes na versao instalada do n8n.
- [ ] Configurar contas/politicas/prompt e credenciais isoladas manualmente.
- [ ] Revisar cerebro e tools isoladas antes de permitir modelo no teste.
- [ ] Adaptar os outros cinco workflows antes de prometer agenda, follow-up,
  lembretes, cancelamento e comparecimento completamente integrados.
- [ ] Integrar assinatura Meta, expiracao/answer_pending, recovery e replay
  automatico de CRM. Ver `n8n/miranda-original-crm/README.md`.

> Atualizado em 10/10/2026.
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

## 26. P1 - Lote 2: Workflow Mestre Omnichannel

Estado em 10/10/2026: especificação, implementação local e primeiro ensaio
Supabase + Redis descartável concluídos na branch
`codex/lote-2-workflow-mestre-omnichannel`, baseada no commit de fechamento do
Lote 1 `4bba3d425992af2308c6edce0e1214c40902fe35`. Um gateway autenticado e seis
workflows HML completos foram publicados somente no n8n de laboratório. O
gateway chama esses seis workflows por ID e executa todos os alvos sintéticos
por rotas de laboratório fechadas, com saída externa suprimida; nenhuma
integração de canal, cérebro real, workflow operacional ou produção foi
realizada. Contratos, fixtures, testes e exports usam somente dados sintéticos.
A revisão funcional usa
também, somente em leitura, o export atualizado da Miranda com 148 nós; o
arquivo bruto não será versionado nem reutilizado como fonte de credenciais ou
destinos.

### Decisões fechadas

- [x] Manter configurações e dados operacionais duráveis no Supabase central.
- [x] Manter Supabases, prompts, Google Agenda e demais tools dentro do cérebro
  privado de cada cliente.
- [x] Projetar Redis compartilhado com escopo por ambiente, empresa, canal,
  conta e conversa.
- [x] Modelar intervenção humana, pausa manual, handoff e agendamento como
  bloqueios independentes.
- [x] Renovar o prazo a cada mensagem de atendente.
- [x] Definir `await_new_message` como retomada padrão e
  `answer_pending` como opção por empresa.
- [x] Exigir resolução e retomada manual separadas para handoff.
- [x] Manter bloqueio da Miranda até o fim original do agendamento, inclusive
  após cancelamento, e suprimir lembretes cancelados.
- [x] Revalidar versão e bloqueios antes de toda entrega.
- [x] Usar um agente de contexto compartilhado com prompt/schema versionados
  por empresa no Supabase central e sem fallback entre tenants.
- [x] Separar contexto operacional central de memória, tools e dados privados
  do cérebro.
- [x] Manter cérebro, tools, lembretes e follow-ups em workflows separados,
  todos subordinados ao mesmo estado e gate de envio.
- [x] Preservar autoria, histórico, mídia, eventos de canal, anúncio e ordem de
  entrega por contratos comuns, sem copiar o workflow inteiro da Miranda.
- [x] Construir mestre e subworkflows antes de conectar cérebro ou escolher
  piloto.
- [x] Excluir Asteric até confirmação explícita de escopo.

### Implementação local concluída

- [x] Versionar schemas v1 para entrada, configuração/saída do contexto,
  comando de estado, evento de domínio, cérebro, automação, ação e resultado de
  entrega, todos marcados como provisórios.
- [x] Implementar key builder com HMAC e funções puras de configuração de
  contexto, autoria/histórico, mídia, máquina de estado, idempotência, retomada
  e entrega ordenada.
- [x] Criar fixtures e testes com duas empresas sintéticas, duas contas e
  colisões intencionais de identificadores externos.
- [x] Testar prompt/histórico isolados, configuração ausente, transcrição
  falhando sem perder pausa, duplicação, entrega parcial e intervenção durante
  resposta em preparação.
- [x] Criar exports inativos do mestre e subworkflows usando somente contexto,
  cérebro, automação e adaptador falsos, sem credenciais ou destinos externos.
- [x] Incluir os testes locais no `npm test` já executado pelo CI e fornecer o
  comando dedicado `npm run test:lote2:local`.
- [x] Vincular contexto a escopo, chamada, versão e mensagens de origem e
  impedir troca entre conversas ou tenants.
- [x] Validar schemas em profundidade, inclusive ações/eventos aninhados, e
  rejeitar regras de schema não suportadas.
- [x] Validar `date-time` sem normalização silenciosa e separar erros de
  definição do schema dos erros de conteúdo, impedindo que referências
  recursivas sejam absorvidas por `not`, `anyOf` ou `oneOf`.
- [x] Preservar prazo humano mais recente, cancelamento sem recriar pausa,
  progresso parcial sob exceção e idempotência sem separador ambíguo.
- [x] Vincular resultado do cérebro ao snapshot e eventos de agendamento à
  operação e referência auditadas da tool; autenticidade real segue pendente.
- [x] Gerar 16 candidatos funcionais inativos da Miranda, com mensagem antes
  de pausa/mídia, buffer atômico, contexto isolado, único dono de envio,
  espelho Frappe, automações pelo gate e comandos reversos do CRM.
- [x] Corrigir webhook Meta agrupado para preservar todos os eventos e manter
  campanha, conjunto e anúncio como atribuição estruturada.
- [x] Fechar `lexia.crm.command.v1` e validar no próprio nó n8n payload, campos
  extras, UUIDs, datas e presença/no-show antes de qualquer consulta/RPC.
- [x] Corrigir o sanitizador de exports para remover também segredos em nomes
  de variável que começam por `token`, `api_key` ou outro marcador sensível.

- [x] Analisar o fluxo atual da Miranda e seus workflows separados como
  referência funcional (`docs/LOTE_2_REFERENCIA_FLUXO_ATUAL_MIRANDA.md`).
- [x] Manter lembretes de agendamento confirmado após remoção manual do seu
  bloco, sob os demais bloqueios.
- [x] Modelar localmente o buffer v2: debounce deslizante preservado,
  eleição por sequência, consumo atômico, um lote por conversa com fencing e
  reaproveitamento do lote descartado.
- [x] Descartar resposta não enviada quando chega mensagem nova do lead e
  reprocessar sem repetir bolhas enviadas nem efeitos de tools.
- [x] Negar lembrete a partir do início da consulta, inclusive sem bloqueio.
- [-] Buffer v2 no runtime: persistência antes do buffer, claim transacional,
  espera/reclaim de lote ocupado e descarte da resposta obsoleta passaram no
  HML. Ainda faltam o varredor de lotes órfãos e a recuperação sob queda real
  do processo antes de considerar o runtime completo.

- [x] Tornar a pausa pós-agendamento configurável por empresa (política
  central, sem valor implícito), com confirmação única vinculada à tool e
  testes de isolamento entre empresas.

- [x] Corrigir a revisão estática do banco (claim com responsável, nulos,
  relógio após locks, bloqueio no buffer, referências, alvo e rollback) e
  adotar D1-D4 no SQL e no TypeScript.
- [x] Construir o mestre executável de teste e seus subworkflows
  (`n8n/omnichannel-test/`), com adaptadores, cérebro e provedor falsos e
  cenários ponta a ponta no executor local.
- [ ] Importar e executar o mestre completo no n8n de teste separado.
- [x] Publicar um gateway sintético autenticado no n8n de laboratório e
  comprovar o ciclo Frappe-n8n com envio externo sempre suprimido.
- [x] Publicar seis subworkflows compactos e legíveis no laboratório, sem nodes
  vermelhos por configuração ausente, e executar os seis alvos pelo gateway.
- [x] Hidratar e publicar, em seis IDs HML separados, os workflows completos
  derivados dos candidatos (312 nodes), com canais/schedules desligados,
  providers `.invalid` e entrega `observe_only`.
- [x] Executar a Entrada HML completa com mensagem sintética, buffer, contexto,
  cérebro, espelho CRM e gate reais do laboratório; a resposta foi suprimida e
  nenhum node de provedor executou.
- [x] Fixar o idioma do lead como regra de entrega: português, inglês e
  espanhol chegam ao redator como idioma obrigatório; uma troca clara vale no
  mesmo turno, mensagem ambígua mantém o idioma anterior e resposta divergente
  é suprimida antes do provider.
- [x] Fazer o gate final priorizar pedido explícito de idioma na última
  mensagem, inclusive quando o pedido está escrito no idioma anterior, sem
  enfraquecer a supressão de respostas realmente divergentes.
- [x] Reproduzir na mesma conversa HML a sequência português -> inglês ->
  espanhol, com gate aprovado em todos os turnos e sem tentativa de envio.
- [x] Reproduzir e corrigir o pedido misto `em espanol`: o cérebro já gerava
  espanhol, mas o gate mantinha português. A execução HML `133270` persistiu
  `idioma: es`, aprovou os dois balões e confirmou
  `provider_send_attempted = false`.
- [x] Reproduzir duas mensagens rápidas durante um lote ativo: a resposta com
  corte antigo foi descartada como `superseded_by_new_message`, o claim foi
  repetido sobre a sequência mais recente e a resposta final reuniu as duas
  mensagens e o histórico sem reapresentar Carol nem repetir a pergunta.
- [x] Alinhar `superseded_by_new_message` ao retorno bem-sucedido do gateway;
  as execuções concorrentes da Entrada `133402` e `133404` terminaram com
  sucesso, sem tentativa de provider.
- [x] Corrigir a escrita de contexto para usar a versão atual do ledger de
  contexto, carregada por conversa/ambiente/empresa, em vez de reutilizar
  `state_version`; conflito de versão continua falhando sem retry cego.
- [x] Trocar o gateway do `/crm/agent-test` dos runtimes compactos para os seis
  workflows HML completos, mantendo rotas sintéticas fechadas e o contrato de
  resposta da tela.
- [x] Despublicar e arquivar as seis cópias compactas remotas depois de validar
  os seis alvos publicados e a rejeição de ambiente diferente de
  `isolated_test`.

### Espelho Frappe da Miranda

- [x] Definir `lexia.crm.event.v1` com escopo completo, origem, autoridade,
  correlação, ordem e idempotência.
- [x] Separar autoridade de provedor, resultado de provedor, tool, workflow,
  cérebro e usuário do CRM; o sistema declarado precisa corresponder à
  autoridade.
- [x] Mapear, somente em leitura, os pontos de emissão nos seis workflows
  atuais da Miranda (`n8n/miranda-crm/miranda-event-map.json`).
- [x] Criar sink n8n inativo e sem rede que aceita apenas modo `shadow_only`.
- [x] Preparar app Frappe local com ledger idempotente e projeções de conversa,
  mensagens, mídia, bloqueios, handoffs, agendamentos, automações e atribuição.
- [x] Instalar o app `0.6.3`, executar 56/56 testes no laboratório Frappe
  isolado e provar que evento atrasado não recria pausa expirada.
- [x] Adicionar `Conversas` ao menu do CRM e criar `/crm/conversations` como
  primeira tela nativa somente leitura, com permissões por DocType e sem
  expor referências privadas ou criar um caminho alternativo de envio.
- [x] Adicionar `Teste do agente` ao menu e criar `/crm/agent-test` com chat
  sintético automático, persistência antes da fila, polling do worker,
  idempotência e saída sempre suprimida; o laboratório começou em
  `local_simulated` e agora usa o gateway sintético no modo `remote`.
- [x] Transformar `Teste do agente` em inbox com múltiplas conversas por
  usuário e impedir listagem ou acesso direto de sintéticos em `Conversas`.
- [x] Criar credenciais técnicas distintas de operação e integração no
  laboratório, armazenadas fora do Git.
- [x] Ligar os seis papéis ao gateway por subworkflows reais do n8n, usando
  somente adaptadores falsos: Entrada, Atendimento IA, Agenda, Automações, CRM
  e Saída passaram no laboratório. Essa etapa compacta foi substituída pelos
  HML completos e suas cópias remotas foram arquivadas após a migração.
- [x] Consolidar os 16 blocos em seis canvases, importar os seis candidatos na
  pasta `CRM MIRANDA SKIN` e religar os Execute Workflow pelos IDs locais. As
  definições remotas agora contêm os workflows HML completos; os candidatos e
  runtimes compactos continuam preservados no Git, mas o gateway atual do
  Agent Test chama somente os IDs HML.
- [x] Validar os tipos de node usados no runtime compacto e executar fixtures
  sem webhooks públicos nos filhos; apenas o gateway autenticado recebe HTTP.
- [-] As APIs e o outbox Frappe emitem `lexia.crm.command.v1`; pausa,
  resolução, retomada, cancelamento e presença/no-show passaram ponta a ponta
  por HTTP. Ainda falta validar os botões em navegador e o consumidor n8n.
- [x] Comparar Frappe e Supabase com adaptadores sintéticos sem alterar o dono
  da entrega; o n8n HML foi exercitado somente em `observe_only`.
- [ ] Revisar e aprovar o contrato antes de qualquer alteração nos seis
  workflows operacionais originais da Miranda.

Resultados atualizados em 10/10/2026: 193/193 testes locais do Lote 2,
47/47 testes focados dos candidatos, reprocessamento e deployment HML,
58/58 testes do app Frappe, 246/246 testes do frontend upstream, 9/9
cenários Supabase + Redis e sete cenários
Frappe + Supabase seguidos de limpeza no laboratório isolado. Redis terminou
com zero chaves e os dados runtime foram removidos. O ensaio completo adicional
removeu seis conversas sintéticas do Frappe e sete do Supabase; a verificação
final encontrou zero mensagens, eventos, contextos, ações, lotes ou chaves do
manifesto. O smoke do chat sintético
Frappe concluiu automaticamente pela fila através do gateway e dos
subworkflows Entrada, Atendimento, CRM e Saída. Testes HTTP separados passaram
pelos seis alvos, sem Supabase, Redis, cérebro real, modelo, tool, canal ou
provedor. Separadamente, a Entrada HML completa percorreu os nodes reais de
laboratório, inclusive modelo e política de idioma, até o gate `observe_only`,
sem executar envio externo. Uma mesma conversa passou por português, inglês e
espanhol; as execuções de Entrada `133203`, `133208` e `133213` confirmaram o
idioma esperado e `provider_send_attempted = false`. Calendar permaneceu
desabilitado. Lint, typecheck e build também foram aprovados. O n8n de
laboratório ainda usa PostgreSQL 15; a CLI recomenda PostgreSQL 17 ou, por
compatibilidade, 16. Isso não bloqueou o ensaio, mas deve ser resolvido antes
de tratar essa instalação como candidata a produção. A importacao que ativa o
gateway tambem emitiu erro no relay de telemetria por `license provider` nao
configurado depois de salvar/ativar; export posterior confirmou o estado
correto, mas a configuracao da instancia precisa ser revisada antes de uso
operacional.
Resultados anteriores em 08/10/2026: 86/86 testes dedicados e 131/131 testes totais
aprovados; lint, typecheck e build também aprovados. Esses resultados validam
somente comportamento local e artefatos inativos, não compatibilidade com
serviços reais.

### Banco e runtime isolados

- [x] Preparar migration aditiva, preflight, verificação, seed, desligamento
  de entrega e rollback (`docs/LOTE_2_REVISAO_BANCO.md`). Foram aplicados
  somente no projeto descartável confirmado; staging e produção permanecem
  sem autorização.
- [x] Modelar bloqueios duráveis, log de eventos, deduplicação, buffer, ações
  de saída, contexto e outbox de projeção no central (em arquivo).
- [x] Estender contactos, mensagens e handoffs com colunas anuláveis e
  gatilho que impede escrita dessas colunas por `authenticated`.
- [x] Escrever RPCs transacionais de comando de estado, buffer e claim de
  saída, com a política do admin aplicada no banco.
- [x] Alinhar as quatro diferenças entre SQL e TypeScript listadas na revisão.
- [x] Preparar localmente baseline mínimo, manifesto e limpeza limitada a duas
  empresas sintéticas em `supabase/isolated/lote2/`, com provider `fake` e
  entrega `observe_only`.
- [x] Supabase e Redis descartáveis passaram conectividade, identidade, vazio
  inicial e preflight; baseline, migrations, fixtures e verificações foram
  aplicados somente em `gaofupndxgitonfmvpzi`.
- [x] Executar o runner integrado com duas empresas, provider `fake`,
  `observe_only`, deduplicação, contexto isolado, pausas independentes,
  handoff, agendamento/cancelamento, retomada `answer_pending` e reprojeção.
  Banco runtime e Redis foram limpos; as configurações sintéticas ficaram.
- [x] Aplicar somente no descartável a migration
  `202610090002_lote2_crm_appointment_cancellation.sql` e exercitar o outbox
  Frappe contra o central com identidades e manifesto revalidados.
- [-] Provar no serviço real as corridas simultâneas de claim, expirações/TTL e
  recuperação após queda de processo; os equivalentes locais passam, mas o
  runner remoto atual é sequencial.

### Plataforma e migração

- [ ] Colocar comandos e leitura v2 atrás de feature flag.
- [ ] Separar `resolver handoff` de `retomar IA` na UI.
- [ ] Controle por empresa "Pausar IA após agendamento confirmado" na
  configuração da empresa, gravado em `lexia_omnichannel_policies`; valores
  iniciais Miranda ligada e Detail desligada; nova empresa exige escolha
  explícita. Permissão aprovada: somente admin Lexia altera (também no
  banco); cliente apenas vê. Vale para todos os canais, só na conversa do
  agendamento.
- [ ] Mostrar múltiplos bloqueios sem permitir que uma retomada apague outros.
- [ ] Inventariar workflows publicados, providers, cérebros, Redis, follow-ups
  e tool de agendamento antes de shadow.
- [ ] Comparar v1 e v2 com v2 em `observe_only` e apenas um dono de entrega.
- [ ] Criar bridge de rollback que preserve pausas e handoffs novos sem `DEL`
  amplo de chaves legadas.
- [ ] Escolher piloto e conectar um cérebro somente após aprovação separada.

### Critérios de aceite antes de piloto

- Duas empresas com os mesmos IDs externos não compartilham chave, evento,
  contexto, bloqueio ou ação.
- Prompt ausente falha fechado e jamais herda prompt ou histórico de outra
  empresa.
- Falha de transcrição de áudio humano preserva mensagem e pausa antes de
  encerrar o fluxo.
- Mensagem de atendente invalida resposta preparada antes de qualquer chamada
  ao provedor.
- Encerrar um motivo preserva todos os outros motivos ativos.
- Handoff só libera a IA depois de resolução e retomada explícitas.
- Agendamento cancelado não lembra e continua bloqueando até o fim original ou
  remoção manual.
- Retry de entrada, cérebro, projeção ou entrega não duplica mensagem.
- Entrega parcial não repete itens confirmados e não avança após falha ou
  intervenção.
- Shadow não possui credencial nem caminho funcional de envio.
- Rollback conserva estado criado durante a migração.

O contrato completo, o inventário conhecido, os arquivos previstos, a ordem de
construção e os gates de aprovação estão em
`docs/LOTE_2_WORKFLOW_MESTRE_OMNICHANNEL.md`.
