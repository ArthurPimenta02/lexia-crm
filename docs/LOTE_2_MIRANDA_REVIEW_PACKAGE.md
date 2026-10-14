# Pacote de revisão - Miranda CRM V2

> Estado em 09/10/2026: artefato local, inativo e sanitizado. Nenhum workflow
> foi importado ou ativado e nenhum serviço real foi chamado.

## Conteúdo alterado

### Plataforma Lexia

- contratos provisórios de solicitação e resultado do teste de workflow;
- validação e simulação local dos seis alvos da Miranda;
- gerador das cópias sanitizadas e scanner de segredos;
- testes de correlação, ambiente, bloqueio de envio, imagem futura e
  disponibilidade versus criação de agendamento;
- documentação da área de testes e dos limites da transição.

### Frappe CRM

- app `lexia_crm 0.3.0`;
- DocType `Lexia Workflow Test Run` e APIs para criar, executar e consultar;
- ação `Testar agente` nos formulários de Lead e Deal;
- configuração restrita ao `site_config.json`, fora do Git e do navegador;
- validação estrita de ambiente, host, correlação e resultado sem envio;
- testes do executor e documentação do laboratório.

### Workflows

- seis cópias de transição: omnichannel, cérebro, follow-up, lembrete,
  criação de agendamento e disponibilidade;
- todos os nós herdados permanecem desativados e sem credenciais;
- cada cópia contém somente um ramo executável de simulação autenticada;
- runtime Omni v2 inteiramente falso para estados, corridas e entrega parcial;
- contrato de imagem em follow-up preparado, com entrega desabilitada.

## Resultados verificados

- `npm test`: 176/176 testes aprovados;
- `npm run test:lote2:local`: 126/126 testes aprovados;
- `npm run lint`: aprovado;
- `npm run typecheck`: aprovado;
- `npm run build`: aprovado com Next.js 16.2.9 e 29 rotas;
- Frappe `lexia_crm`: 27/27 testes aprovados no laboratório isolado;
- ação `Testar agente`: visível em Lead e Deal;
- limpeza: zero `Lexia Workflow Test Run`, `Lexia Integration Event` e
  `Lexia Handoff` deixados pela suíte;
- varredura do pacote: zero segredo e zero caminho proibido.

## Ainda não verificado

- importação ou ativação das cópias no n8n;
- configuração dos seis endpoints e do segredo no laboratório;
- conexão com Supabase, Redis, modelos, tools, agenda ou provedores;
- compatibilidade dinâmica com os seis workflows ativos;
- envio real, mídia real e reconciliação com APIs reais;
- controle produtivo de pausa, retomada, handoff ou comparecimento pelo CRM.

As cópias de transição preservam a topologia para revisão, mas não são o
workflow mestre integrado definitivo. Os workflows ativos fornecidos não foram
alterados.
