import type { TextosDaArea } from "../traduzir";

/**
 * Textos da área "catalogo". A chave é o texto em português do Brasil, exatamente
 * como está no código dentro de t("…"). Variáveis entre chaves ({n}) têm de
 * aparecer com o mesmo nome nas três traduções.
 *
 * Além dos t("…") literais, aqui estão também textos que o teste não vê:
 * - as mensagens das escritas em `lib/servicos/write.ts`, `lib/produtos/write.ts`
 *   e das server actions de serviços/produtos (traduzidas por
 *   `lib/catalogo/traduzir-resultado.ts`);
 * - os `vazioMotivo` de `lib/servicos/read.ts` (lib partilhada, ainda em
 *   pt-PT, traduzidos onde se desenham);
 * - os rótulos dos períodos de `lib/dashboard/date-range.ts`.
 * Quem mudar uma destas frases na origem tem de a mudar aqui também.
 */
const textos: TextosDaArea = {
  "pt-PT": {
    // ---- Serviços: painel
    "preço único": "preço único",
    "preço base": "preço base",
    "preço deste escalão": "preço deste escalão",
    "preço único, não varia com o veículo": "preço único, não varia com a viatura",
    "não é cobrado por escalão, mostra o base": "não é cobrado por escalão, mostra o base",
    "sem preço definido para este escalão, mostra o base":
      "sem preço definido para este escalão, mostra o base",
    "Não executa este serviço.": "Não executa este serviço.",
    "Rende {valor} por hora ocupada.": "Rende {valor} por hora ocupada.",
    "Custo de produto": "Custo de produto",
    "Margem": "Margem",
    "Produtos na receita": "Produtos na receita",
    "Preço base": "Preço base",
    "executor": "executor",
    "Escalão de viatura": "Escalão de viatura",
    "Todos os serviços já têm produtos associados.":
      "Todos os serviços já têm produtos associados.",
    "{n} ainda sem produtos associados: marcar esses como realizados não desconta nada.":
      "{n} ainda sem produtos associados: marcá-los como realizados não desconta nada.",
    "Serviços ativos": "Serviços activos",
    "{servico}: o que mais rende por hora ocupada de {executor}.":
      "{servico}: o que mais rende por hora ocupada de {executor}.",
    "Faltam durações ou preços para comparar.": "Faltam durações ou preços para comparar.",
    "Melhor receita/hora": "Melhor receita/hora",
    "{servico}: ocupa horas de {executor} e rende menos por hora.":
      "{servico}: ocupa horas de {executor} e rende menos por hora.",
    "Pior receita/hora": "Pior receita/hora",
    "Ainda não há produtos registrados.": "Ainda não há produtos registados.",
    "O custo de produto de cada serviço sai da lista de produtos que ele gasta. Comece registrando os produtos e as compras na página Produtos; depois volte aqui e diga quanto cada serviço gasta de cada um.":
      "O custo de produto de cada serviço sai da lista de produtos que ele gasta. Começa por registar os produtos e as compras na página Produtos; depois voltas aqui e dizes quanto cada serviço gasta de cada um.",
    "Sem categoria": "Sem categoria",
    "Não variam com o veículo. A margem é calculada sobre o preço base.":
      "Não variam com a viatura. A margem é calculada sobre o preço base.",
    "A margem é calculada sobre o preço base.": "A margem é calculada sobre o preço base.",
    "Outros preços deste serviço": "Outros preços deste serviço",
    "Nota do catálogo": "Nota do catálogo",
    "Este serviço existe no catálogo de venda mas não tem linha de agendamento, então não tem duração. Confirme se é intencional.":
      "Este serviço existe no catálogo de venda mas não tem linha de agendamento, logo não tem duração. Confirma se é intencional.",
    "O preço está diferente nas duas tabelas do cliente: o catálogo diz {catalogo} e o agendamento diz {agendamento}. Salvar o preço aqui volta a alinhar os dois.":
      "O preço está diferente nas duas tabelas do cliente: o catálogo diz {catalogo} e o agendamento diz {agendamento}. Guardar o preço aqui volta a alinhar os dois.",
    "Há produtos nesta receita sem compra registrada, por isso ainda não têm preço. O custo e a margem ficam vazios até você registrar quanto pagou por eles na página Produtos: somar só os que têm preço daria uma margem melhor do que a real.":
      "Há produtos nesta receita sem compra registada, por isso ainda não têm preço. O custo e a margem ficam vazios até registares quanto pagaste por eles na página Produtos: somar só os que têm preço dava uma margem melhor do que a real.",
    "Continuam no banco de dados com preço, notas, receita e histórico. Só o agente é que deixou de vendê-los.":
      "Continuam na base de dados com preço, notas, receita e histórico. O agente é que deixou de os vender.",
    "Excluídos": "Excluídos",
    // vazioMotivo de lib/servicos/read.ts (texto-fonte ainda em pt-PT)
    "Não foi possível ler o catálogo de serviços.": "Não foi possível ler o catálogo de serviços.",
    "Sem serviços activos.": "Sem serviços activos.",
    "Sem serviços activos no catálogo.": "Sem serviços activos no catálogo.",
    "Este cliente ainda não tem catálogo de serviços ligado ao painel.":
      "Este cliente ainda não tem catálogo de serviços ligado ao painel.",
    "Credenciais da base de dados do cliente não configuradas no servidor.":
      "Credenciais da base de dados do cliente não configuradas no servidor.",

    // ---- Serviços: formulários
    "Excluir serviço": "Excluir serviço",
    'Excluir "{nome}"? O agente deixa de vendê-lo e o agendamento deixa de aceitá-lo. O preço, a receita e o histórico ficam guardados, e você pode restaurá-lo logo abaixo.':
      'Excluir "{nome}"? O agente deixa de o vender e o agendamento deixa de o aceitar. O preço, a receita e o histórico ficam guardados, e podes repô-lo em baixo.',
    "Cancelar": "Cancelar",
    "Excluindo...": "A excluir...",
    "Sim, excluir": "Sim, excluir",
    "Restaurando...": "A repor...",
    "Restaurar": "Repor",
    "Descontando...": "A descontar...",
    "Realizei este serviço": "Realizei este serviço",
    "Preço base ({moeda})": "Preço base ({moeda})",
    "0,00": "0,00",
    "só no escalão base": "só no escalão base",
    "Notas": "Notas",
    "ex.: 1/3 de frasco de cerâmico": "ex.: 1/3 de frasco de cerâmico",
    "Salvando...": "A guardar...",
    "Salvar": "Guardar",
    "Quantidade de {produto}": "Quantidade de {produto}",
    "sem preço": "sem preço",
    "Produto a adicionar": "Produto a juntar",
    "Quantidade gasta": "Quantidade gasta",
    "Adicionando...": "A juntar...",
    "Adicionar à receita": "Juntar à receita",
    "Produtos gastos neste serviço": "Produtos gastos neste serviço",
    "Nenhum ainda. Enquanto esta lista estiver vazia, marcar o serviço como realizado não desconta nada do estoque.":
      "Ainda nenhum. Enquanto esta lista estiver vazia, marcar o serviço como realizado não desconta nada do stock.",

    // ---- Produtos
    "Você ainda não registrou nenhum serviço com este produto.":
      "Ainda não registaste nenhum serviço com este produto.",
    "Falta mais uma execução registrada para haver ritmo de consumo.":
      "Falta mais uma execução registada para haver ritmo de consumo.",
    "Sem consumo medido.": "Sem consumo medido.",
    "Acabou. O estoque está zerado ou negativo.": "Acabou. O stock está a zero ou negativo.",
    "No ritmo de {quantidade} {unidade} por dia, medido desde a primeira saída.":
      "Ao ritmo de {quantidade} {unidade} por dia, medido desde a primeira saída.",
    "Compra": "Compra",
    "Consumo": "Consumo",
    "Ajuste": "Ajuste",
    "Novo produto": "Novo produto",
    "Ainda não há produtos. Crie o primeiro acima.": "Ainda não há produtos. Cria o primeiro acima.",
    "em estoque": "em stock",
    "Custo por {unidade}": "Custo por {unidade}",
    "Valor do estoque": "Valor do stock",
    "Dura mais": "Dura mais",
    "{n} dia": "{n} dia",
    "{n} dias": "{n} dias",
    "Sem compra registrada, este produto não tem preço, e os serviços que o usam ficam sem custo e sem margem. Registre abaixo quanto você pagou da última vez que o comprou.":
      "Sem compra registada, este produto não tem preço, e os serviços que o usam ficam sem custo e sem margem. Regista em baixo quanto pagaste da última vez que o compraste.",
    "Últimos movimentos": "Últimos movimentos",
    "O estoque e as compras destes produtos continuam guardados. Restaurar traz o produto de volta, mas não as quantidades por serviço.":
      "O stock e as compras destes produtos continuam guardados. Repor traz o produto de volta, mas não as quantidades por serviço.",
    "Nome do produto": "Nome do produto",
    "ex.: Cerâmico 4 anos": "ex.: Cerâmico 4 anos",
    "Unidade": "Unidade",
    "opcional": "opcional",
    "Criando...": "A criar...",
    "Criar produto": "Criar produto",
    "Comprei mais": "Comprei mais",
    "Quantidade comprada": "Quantidade comprada",
    "qtd. em {unidade}": "qtd. em {unidade}",
    "Total pago": "Total pago",
    "total {moeda}": "total {moeda}",
    "Registrando...": "A registar...",
    "Registrar compra": "Registar compra",
    "O total é o que você pagou pela quantidade toda. O custo por {unidade} sai daí e passa a valer para a margem de todos os serviços que usam este produto.":
      "O total é o que pagaste pela quantidade toda. O custo por {unidade} sai daí e passa a valer para a margem de todos os serviços que usam este produto.",
    "Corrigir o estoque": "Corrigir o stock",
    "O ajuste soma ou subtrai": "O ajuste soma ou subtrai",
    "Tirar": "Tirar",
    "Adicionar": "Juntar",
    "Quantidade do ajuste": "Quantidade do ajuste",
    "Motivo do ajuste": "Motivo do ajuste",
    "motivo (ex.: derramei)": "motivo (ex.: entornei)",
    "Ajustando...": "A ajustar...",
    "Ajustar": "Ajustar",
    "Quantidade gasta em {servico}": "Quantidade gasta em {servico}",
    "Serviço a ligar": "Serviço a ligar",
    "Quantidade gasta por execução": "Quantidade gasta por execução",
    "Ligando...": "A ligar...",
    "Ligar serviço": "Ligar serviço",
    "Serviços que gastam este produto": "Serviços que gastam este produto",
    "Nenhum. Enquanto nenhum serviço gastar este produto, o estoque só muda quando você registra compras ou ajustes à mão.":
      "Nenhum. Enquanto nenhum serviço gastar este produto, o stock só muda quando registas compras ou ajustes à mão.",
    "Colocar a quantidade em zero tira o serviço desta lista.":
      "Pôr a quantidade a zero tira o serviço desta lista.",
    "Excluir produto": "Excluir produto",
    'Excluir "{nome}"? O estoque e o histórico ficam guardados e você pode restaurá-lo.':
      'Excluir "{nome}"? O stock e o histórico ficam guardados e podes repô-lo.',
    'Excluir "{nome}"? Sai também da receita de {n} serviço, e essas quantidades não voltam se você restaurá-lo.':
      'Excluir "{nome}"? Sai também da receita de {n} serviço, e essas quantidades não voltam se o repuseres.',
    'Excluir "{nome}"? Sai também da receita de {n} serviços, e essas quantidades não voltam se você restaurá-lo.':
      'Excluir "{nome}"? Sai também da receita de {n} serviços, e essas quantidades não voltam se o repuseres.',

    // ---- Campanhas
    "Sem gasto registrado no período.": "Sem gasto registado no período.",
    "{n} contato": "{n} contacto",
    "{n} contatos": "{n} contactos",
    "Sem campanhas com gasto no período.": "Sem campanhas com gasto no período.",
    "{cliques} cliques · {impressoes} impressões": "{cliques} cliques · {impressoes} impressões",
    "{n} contato identificado": "{n} contacto identificado",
    "{n} contatos identificados": "{n} contactos identificados",
    "{n} agendamento": "{n} marcação",
    "{n} agendamentos": "{n} marcações",
    "Período": "Período",
    "Hoje": "Hoje",
    "Esta semana": "Esta semana",
    "Este mês": "Este mês",
    "Personalizada": "Personalizada",
    "Início": "Início",
    "Fim": "Fim",
    "Aplicando...": "A aplicar...",
    "Aplicar": "Aplicar",
    "no período": "no período",
    "Investimento": "Investimento",
    "Soma do que a Meta cobrou nos dias do período, no fuso da conta de anúncios.":
      "Soma do que a Meta cobrou nos dias do período, no fuso da conta de anúncios.",
    "Investido": "Investido",
    "Pessoas que entraram em contato no período, por qualquer via, não só por anúncio.":
      "Pessoas que entraram em contacto no período, por qualquer via, não só por anúncio.",
    "Contatos novos": "Contactos novos",
    "Investido dividido pelos contatos novos. É um limite superior do custo real por lead de anúncio.":
      "Investido a dividir pelos contactos novos. É um limite superior do custo real por lead de anúncio.",
    "Custo por contato": "Custo por contacto",
    "Cliques em qualquer parte do anúncio.": "Cliques em qualquer parte do anúncio.",
    "Cliques": "Cliques",
    "{n} no link": "{n} no link",
    "Entrega": "Entrega",
    "Impressões servidas no período. Uma pessoa pode ver o anúncio várias vezes.":
      "Impressões servidas no período. Uma pessoa pode ver o anúncio várias vezes.",
    "Impressões": "Impressões",
    "Custo por mil impressões, recalculado do total do período.":
      "Custo por mil impressões, recalculado do total do período.",
    "Cliques divididos pelas impressões, recalculado do total do período.":
      "Cliques a dividir pelas impressões, recalculado do total do período.",
    "Gasto por dia": "Gasto por dia",
    "Passe o mouse sobre uma barra para ver o gasto e os contatos daquele dia.":
      "Passa o rato numa barra para ver o gasto e os contactos daquele dia.",
    "Gasto por campanha": "Gasto por campanha",
    "por investimento": "por investimento",
    'Por que não existe "custo por mensagem" por campanha':
      'Porque não existe "custo por mensagem" por campanha',
    "A Meta não devolve conversas iniciadas nesta conta: os conjuntos que otimizam conversas enviam as pessoas para o Instagram Direct, que não identifica o anúncio de origem. Por isso o custo acima é calculado sobre todos os contatos novos, e não só sobre os que vieram de anúncio. Serve para comparar períodos, não para afirmar o custo exato de um lead pago.":
      "A Meta não devolve conversas iniciadas nesta conta: os conjuntos que optimizam conversas enviam as pessoas para o Instagram Direct, que não identifica o anúncio de origem. Por isso o custo acima é calculado sobre todos os contactos novos, e não só sobre os que vieram de anúncio. Serve para comparar períodos, não para afirmar o custo exacto de um lead pago.",
    "Os contatos identificados por campanha vêm da mesma limitação: {com} de {total} contatos novos do período trazem o anúncio de origem. Só o clique para WhatsApp o envia. É um mínimo garantido, não um total: vale para comparar campanhas entre si, porque a regra falha igual em todas, e não vale para dizer que fatia dos contatos veio de anúncio pago.":
      "Os contactos identificados por campanha vêm da mesma limitação: {com} de {total} contactos novos do período trazem o anúncio de origem. Só o clique-para-WhatsApp o envia. É um mínimo garantido, não um total: vale para comparar campanhas entre si, porque a regra falha igual em todas, e não vale para dizer que fatia dos contactos veio de anúncio pago.",
    "Ainda não há dados de campanhas": "Ainda não há dados de campanhas",
    "Puxando...": "A puxar...",
    "Atualizar": "Actualizar",
    "Puxando da Meta...": "A puxar da Meta...",
    "Atualizar dados": "Actualizar dados",
    "Última atualização: {data}": "Última actualização: {data}",
    "Nunca atualizado.": "Nunca actualizado.",

    // ---- Páginas
    "Serviços e margem": "Serviços e margem",
    "Serviços": "Serviços",
    "Produtos e estoque": "Produtos e stock",
    "Produtos": "Produtos",
    "Campanhas": "Campanhas",
    'Clique em "Atualizar dados" para puxar o histórico da Meta. Se continuar vazio, a conta de anúncios ainda não está ligada a esta empresa.':
      'Carrega em "Actualizar dados" para puxar o histórico da Meta. Se continuar vazio, a conta de anúncios ainda não está ligada a esta empresa.',
    "Não foi possível buscar os clientes.": "Não foi possível obter os clientes.",
    "Nenhum cliente ativo disponível.": "Nenhum cliente activo disponível.",
    "Cliente": "Cliente",
    "(sem catálogo ligado)": "(sem catálogo ligado)",
    "Selecionar": "Seleccionar",
    "(sem conta ligada)": "(sem conta ligada)",
    'Este cliente tem conta de anúncios ligada, mas ainda não há gasto salvo. Clique em "Atualizar dados" para puxar o histórico da Meta.':
      'Este cliente tem conta de anúncios ligada, mas ainda não há gasto gravado. Carrega em "Actualizar dados" para puxar o histórico da Meta.',
    "Este cliente não tem conta de anúncios ligada. Faltam as variáveis de ambiente {variaveis}.":
      "Este cliente não tem conta de anúncios ligada. Faltam as variáveis de ambiente {variaveis}.",
    "e": "e",
    "Este cliente não tem conta de anúncios ligada. Falta a variável de ambiente {variavel}.":
      "Este cliente não tem conta de anúncios ligada. Falta a variável de ambiente {variavel}.",

    // ---- Mensagens das server actions e de lib/*/write.ts
    "Sessão sem permissão para editar serviços.": "Sessão sem permissão para editar serviços.",
    "Sessão sem permissão para editar produtos.": "Sessão sem permissão para editar produtos.",
    "Sessão sem permissão para atualizar campanhas.":
      "Sessão sem permissão para actualizar campanhas.",
    "Serviço não identificado.": "Serviço não identificado.",
    "Produto não identificado.": "Produto não identificado.",
    "Produto ou serviço não identificado.": "Produto ou serviço não identificado.",
    "Escolha um cliente primeiro.": "Escolhe um cliente primeiro.",
    "Cliente desconhecido.": "Cliente desconhecido.",
    "Os dados foram puxados há menos de um minuto. Já estão atualizados.":
      "Os dados foram puxados há menos de um minuto. Já estão actualizados.",
    "Atualizado: {dias} dias de {campanhas} campanhas.":
      "Actualizado: {dias} dias de {campanhas} campanhas.",
    "Não foi possível atualizar agora. Tente de novo em instantes.":
      "Não foi possível actualizar agora. Tenta outra vez em instantes.",
    "Este cliente não tem painel de serviços.": "Este cliente não tem painel de serviços.",
    "Credenciais do banco de dados do cliente não configuradas.":
      "Credenciais da base de dados do cliente não configuradas.",
    "As notas estão longas demais.": "As notas são demasiado longas.",
    "Não foi possível ler o serviço.": "Não foi possível ler o serviço.",
    "Serviço desconhecido.": "Serviço desconhecido.",
    "Não foi possível salvar as notas.": "Não foi possível guardar as notas.",
    'Notas de "{nome}" salvas.': 'Notas de "{nome}" guardadas.',
    "Notas salvas, mas o preço não: preencha o preço.":
      "Notas guardadas, mas o preço não: preenche o preço.",
    "Notas salvas, mas o preço não: tem de ser um número igual ou maior que zero.":
      "Notas guardadas, mas o preço não: tem de ser um número igual ou maior que zero.",
    "Notas salvas, mas o preço não: está fora do intervalo aceitável.":
      "Notas guardadas, mas o preço não: está fora do intervalo aceitável.",
    "Notas salvas, mas o preço não foi alterado.": "Notas guardadas, mas o preço não foi alterado.",
    '"{nome}" não foi restaurado: o catálogo recusou a gravação.':
      '"{nome}" não foi reposto: o catálogo recusou a escrita.',
    '"{nome}" não foi excluído: o catálogo recusou a gravação.':
      '"{nome}" não foi excluído: o catálogo recusou a escrita.',
    '"{nome}" foi restaurado no catálogo, mas não foi possível confirmar a linha de agendamento. Verifique {tabela} no Supabase.':
      '"{nome}" ficou reposto no catálogo, mas não foi possível confirmar a linha de agendamento. Verifica {tabela} na Supabase.',
    '"{nome}" foi excluído no catálogo, mas não foi possível confirmar a linha de agendamento. Verifique {tabela} no Supabase.':
      '"{nome}" ficou excluído no catálogo, mas não foi possível confirmar a linha de agendamento. Verifica {tabela} na Supabase.',
    '"{nome}" restaurado. Não tinha linha em {tabela}, por isso só o catálogo mudou.':
      '"{nome}" reposto. Não tinha linha em {tabela}, por isso só o catálogo mudou.',
    '"{nome}" excluído. Não tinha linha em {tabela}, por isso só o catálogo mudou.':
      '"{nome}" excluído. Não tinha linha em {tabela}, por isso só o catálogo mudou.',
    '"{nome}" foi restaurado no catálogo, mas a tabela de agendamento recusou a gravação. Verifique {tabela} no Supabase.':
      '"{nome}" ficou reposto no catálogo, mas a tabela de agendamento recusou a escrita. Verifica {tabela} na Supabase.',
    '"{nome}" foi excluído no catálogo, mas a tabela de agendamento recusou a gravação. Verifique {tabela} no Supabase.':
      '"{nome}" ficou excluído no catálogo, mas a tabela de agendamento recusou a escrita. Verifica {tabela} na Supabase.',
    '"{nome}" restaurado: volta a ser vendido pelo agente e a aceitar agendamentos.':
      '"{nome}" reposto: volta a ser vendido pelo agente e a aceitar marcações.',
    '"{nome}" excluído: sai do painel e o agente deixa de vendê-lo. Você pode restaurá-lo logo abaixo.':
      '"{nome}" excluído: sai do painel e o agente deixa de o vender. Podes repô-lo em baixo.',
    "Preço não alterado: não foi possível confirmar a linha de agendamento.":
      "Preço não alterado: não foi possível confirmar a linha de agendamento.",
    'Preço não alterado: "{nome}" não tem linha em {tabela}, e mudar só o catálogo faria o agente vender um preço que o agendamento não cobra.':
      'Preço não alterado: "{nome}" não tem linha em {tabela}, e mudar só o catálogo punha o agente a vender um preço que o agendamento não cobra.',
    "Preço não alterado: a tabela de agendamento recusou a gravação.":
      "Preço não alterado: a tabela de agendamento recusou a escrita.",
    '"{nome}" salvo: preço atualizado nas duas tabelas do cliente.':
      '"{nome}" guardado: preço actualizado nas duas tabelas do cliente.',
    "O preço ficou salvo só no catálogo e não foi possível desfazer. Verifique o serviço no Supabase antes de salvar de novo.":
      "O preço ficou gravado só no catálogo e não foi possível desfazer. Verifica o serviço na Supabase antes de voltar a guardar.",
    "Preencha quanto você pagou.": "Preenche o que pagaste.",
    "O valor pago tem de ser um número maior que zero.":
      "O valor pago tem de ser um número maior que zero.",
    "O valor pago está fora do intervalo aceitável.": "O valor pago está fora do intervalo aceitável.",
    "Preencha a quantidade.": "Preenche a quantidade.",
    "A quantidade tem de ser um número maior que zero.":
      "A quantidade tem de ser um número maior que zero.",
    "A quantidade está fora do intervalo aceitável.": "A quantidade está fora do intervalo aceitável.",
    "Preencha a quantidade comprada.": "Preenche a quantidade comprada.",
    "A quantidade comprada tem de ser um número maior que zero.":
      "A quantidade comprada tem de ser um número maior que zero.",
    "A quantidade comprada está fora do intervalo aceitável.":
      "A quantidade comprada está fora do intervalo aceitável.",
    "Este cliente não tem catálogo de serviços ligado.":
      "Este cliente não tem catálogo de serviços ligado.",
    "Dê um nome ao produto.": "Dá um nome ao produto.",
    "Escolha uma unidade válida.": "Escolhe uma unidade válida.",
    'Já existe um produto chamado "{nome}".': 'Já existe um produto chamado "{nome}".',
    "Não foi possível criar o produto.": "Não foi possível criar o produto.",
    '"{nome}" criado.': '"{nome}" criado.',
    "Quantidade inválida.": "Quantidade inválida.",
    "Valor inválido.": "Valor inválido.",
    "Produto desconhecido.": "Produto desconhecido.",
    "Não foi possível registrar a compra.": "Não foi possível registar a compra.",
    "Compra registrada: {quantidade} {unidade} de {produto} a {unitario} €/{unidade}.":
      "Compra registada: {quantidade} {unidade} de {produto} a {unitario} €/{unidade}.",
    "Escolha se o ajuste soma ou subtrai.": "Escolhe se o ajuste soma ou subtrai.",
    "Não foi possível registrar o ajuste.": "Não foi possível registar o ajuste.",
    "Estoque de {produto} ajustado.": "Stock de {produto} ajustado.",
    "Não foi possível tirar o produto das receitas dos serviços.":
      "Não foi possível tirar o produto das receitas dos serviços.",
    "Não foi possível excluir o produto.": "Não foi possível excluir o produto.",
    '"{nome}" excluído. O histórico fica guardado e você pode restaurá-lo logo abaixo.':
      '"{nome}" excluído. O histórico fica guardado e podes repô-lo em baixo.',
    '"{nome}" excluído e tirado de {n} serviço. Se você restaurá-lo, a quantidade em cada serviço precisa ser definida de novo.':
      '"{nome}" excluído e tirado de {n} serviço. Se o repuseres, a quantidade em cada serviço tem de ser outra vez definida.',
    '"{nome}" excluído e tirado de {n} serviços. Se você restaurá-lo, a quantidade em cada serviço precisa ser definida de novo.':
      '"{nome}" excluído e tirado de {n} serviços. Se o repuseres, a quantidade em cada serviço tem de ser outra vez definida.',
    "Não foi possível restaurar o produto.": "Não foi possível repor o produto.",
    '"{nome}" restaurado. Diga de novo quanto cada serviço gasta dele.':
      '"{nome}" reposto. Volta a dizer quanto cada serviço gasta dele.',
    '"{nome}" está excluído. Restaure-o na página Produtos antes de usá-lo num serviço.':
      '"{nome}" está excluído. Repõe-no na página Produtos antes de o usar num serviço.',
    "Não foi possível remover o produto.": "Não foi possível remover o produto.",
    '{produto} saiu da receita de "{servico}".': '{produto} saiu da receita de "{servico}".',
    "Não foi possível salvar a receita.": "Não foi possível guardar a receita.",
    '"{servico}" passa a gastar {quantidade} {unidade} de {produto}.':
      '"{servico}" passa a gastar {quantidade} {unidade} de {produto}.',
    "Não foi possível ler a receita do serviço.": "Não foi possível ler a receita do serviço.",
    '"{servico}" ainda não tem produtos associados, nada para descontar.':
      '"{servico}" ainda não tem produtos associados, nada para descontar.',
    "Não foi possível descontar do estoque.": "Não foi possível descontar do stock.",
    '"{servico}" registrado: {n} produto descontado do estoque.':
      '"{servico}" registado: {n} produto descontado do stock.',
    '"{servico}" registrado: {n} produtos descontados do estoque.':
      '"{servico}" registado: {n} produtos descontados do stock.',
  },

  es: {
    // ---- Servicios: panel
    "preço único": "precio único",
    "preço base": "precio base",
    "preço deste escalão": "precio de esta categoría",
    "preço único, não varia com o veículo": "precio único, no varía según el vehículo",
    "não é cobrado por escalão, mostra o base": "no se cobra por categoría, se muestra el base",
    "sem preço definido para este escalão, mostra o base":
      "sin precio definido para esta categoría, se muestra el base",
    "Não executa este serviço.": "No realiza este servicio.",
    "Rende {valor} por hora ocupada.": "Genera {valor} por hora ocupada.",
    "Custo de produto": "Costo de producto",
    "Margem": "Margen",
    "Produtos na receita": "Productos en la receta",
    "Preço base": "Precio base",
    "executor": "profesional",
    "Escalão de viatura": "Categoría de vehículo",
    "Todos os serviços já têm produtos associados.":
      "Todos los servicios ya tienen productos asociados.",
    "{n} ainda sem produtos associados: marcar esses como realizados não desconta nada.":
      "{n} aún sin productos asociados: marcarlos como realizados no descuenta nada.",
    "Serviços ativos": "Servicios activos",
    "{servico}: o que mais rende por hora ocupada de {executor}.":
      "{servico}: el que más genera por hora ocupada de {executor}.",
    "Faltam durações ou preços para comparar.": "Faltan duraciones o precios para comparar.",
    "Melhor receita/hora": "Mejor ingreso/hora",
    "{servico}: ocupa horas de {executor} e rende menos por hora.":
      "{servico}: ocupa horas de {executor} y genera menos por hora.",
    "Pior receita/hora": "Peor ingreso/hora",
    "Ainda não há produtos registrados.": "Aún no hay productos registrados.",
    "O custo de produto de cada serviço sai da lista de produtos que ele gasta. Comece registrando os produtos e as compras na página Produtos; depois volte aqui e diga quanto cada serviço gasta de cada um.":
      "El costo de producto de cada servicio sale de la lista de productos que usa. Empieza registrando los productos y las compras en la página Productos; después vuelve aquí e indica cuánto usa cada servicio de cada uno.",
    "Sem categoria": "Sin categoría",
    "Não variam com o veículo. A margem é calculada sobre o preço base.":
      "No varían según el vehículo. El margen se calcula sobre el precio base.",
    "A margem é calculada sobre o preço base.": "El margen se calcula sobre el precio base.",
    "Outros preços deste serviço": "Otros precios de este servicio",
    "Nota do catálogo": "Nota del catálogo",
    "Este serviço existe no catálogo de venda mas não tem linha de agendamento, então não tem duração. Confirme se é intencional.":
      "Este servicio existe en el catálogo de venta pero no tiene fila de agenda, así que no tiene duración. Confirma si es intencional.",
    "O preço está diferente nas duas tabelas do cliente: o catálogo diz {catalogo} e o agendamento diz {agendamento}. Salvar o preço aqui volta a alinhar os dois.":
      "El precio es distinto en las dos tablas del cliente: el catálogo dice {catalogo} y la agenda dice {agendamento}. Guardar el precio aquí vuelve a alinear los dos.",
    "Há produtos nesta receita sem compra registrada, por isso ainda não têm preço. O custo e a margem ficam vazios até você registrar quanto pagou por eles na página Produtos: somar só os que têm preço daria uma margem melhor do que a real.":
      "Hay productos en esta receta sin compra registrada, por eso aún no tienen precio. El costo y el margen quedan vacíos hasta que registres cuánto pagaste por ellos en la página Productos: sumar solo los que tienen precio daría un margen mejor que el real.",
    "Continuam no banco de dados com preço, notas, receita e histórico. Só o agente é que deixou de vendê-los.":
      "Siguen en la base de datos con precio, notas, receta e historial. Solo el agente dejó de venderlos.",
    "Excluídos": "Eliminados",
    "Não foi possível ler o catálogo de serviços.": "No se pudo leer el catálogo de servicios.",
    "Sem serviços activos.": "Sin servicios activos.",
    "Sem serviços activos no catálogo.": "Sin servicios activos en el catálogo.",
    "Este cliente ainda não tem catálogo de serviços ligado ao painel.":
      "Este cliente aún no tiene un catálogo de servicios conectado al panel.",
    "Credenciais da base de dados do cliente não configuradas no servidor.":
      "Credenciales de la base de datos del cliente no configuradas en el servidor.",

    // ---- Servicios: formularios
    "Excluir serviço": "Eliminar servicio",
    'Excluir "{nome}"? O agente deixa de vendê-lo e o agendamento deixa de aceitá-lo. O preço, a receita e o histórico ficam guardados, e você pode restaurá-lo logo abaixo.':
      '¿Eliminar "{nome}"? El agente deja de venderlo y la agenda deja de aceptarlo. El precio, la receta y el historial quedan guardados, y puedes restaurarlo más abajo.',
    "Cancelar": "Cancelar",
    "Excluindo...": "Eliminando...",
    "Sim, excluir": "Sí, eliminar",
    "Restaurando...": "Restaurando...",
    "Restaurar": "Restaurar",
    "Descontando...": "Descontando...",
    "Realizei este serviço": "Realicé este servicio",
    "Preço base ({moeda})": "Precio base ({moeda})",
    "0,00": "0,00",
    "só no escalão base": "solo en la categoría base",
    "Notas": "Notas",
    "ex.: 1/3 de frasco de cerâmico": "ej.: 1/3 de frasco de cerámico",
    "Salvando...": "Guardando...",
    "Salvar": "Guardar",
    "Quantidade de {produto}": "Cantidad de {produto}",
    "sem preço": "sin precio",
    "Produto a adicionar": "Producto a añadir",
    "Quantidade gasta": "Cantidad usada",
    "Adicionando...": "Añadiendo...",
    "Adicionar à receita": "Añadir a la receta",
    "Produtos gastos neste serviço": "Productos usados en este servicio",
    "Nenhum ainda. Enquanto esta lista estiver vazia, marcar o serviço como realizado não desconta nada do estoque.":
      "Ninguno todavía. Mientras esta lista esté vacía, marcar el servicio como realizado no descuenta nada del inventario.",

    // ---- Productos
    "Você ainda não registrou nenhum serviço com este produto.":
      "Aún no has registrado ningún servicio con este producto.",
    "Falta mais uma execução registrada para haver ritmo de consumo.":
      "Falta registrar una ejecución más para tener un ritmo de consumo.",
    "Sem consumo medido.": "Sin consumo medido.",
    "Acabou. O estoque está zerado ou negativo.": "Se acabó. El inventario está en cero o negativo.",
    "No ritmo de {quantidade} {unidade} por dia, medido desde a primeira saída.":
      "Al ritmo de {quantidade} {unidade} por día, medido desde la primera salida.",
    "Compra": "Compra",
    "Consumo": "Consumo",
    "Ajuste": "Ajuste",
    "Novo produto": "Nuevo producto",
    "Ainda não há produtos. Crie o primeiro acima.": "Aún no hay productos. Crea el primero arriba.",
    "em estoque": "en inventario",
    "Custo por {unidade}": "Costo por {unidade}",
    "Valor do estoque": "Valor del inventario",
    "Dura mais": "Dura",
    "{n} dia": "{n} día",
    "{n} dias": "{n} días",
    "Sem compra registrada, este produto não tem preço, e os serviços que o usam ficam sem custo e sem margem. Registre abaixo quanto você pagou da última vez que o comprou.":
      "Sin compra registrada, este producto no tiene precio, y los servicios que lo usan quedan sin costo y sin margen. Registra abajo cuánto pagaste la última vez que lo compraste.",
    "Últimos movimentos": "Últimos movimientos",
    "O estoque e as compras destes produtos continuam guardados. Restaurar traz o produto de volta, mas não as quantidades por serviço.":
      "El inventario y las compras de estos productos siguen guardados. Restaurar trae el producto de vuelta, pero no las cantidades por servicio.",
    "Nome do produto": "Nombre del producto",
    "ex.: Cerâmico 4 anos": "ej.: Cerámico 4 años",
    "Unidade": "Unidad",
    "opcional": "opcional",
    "Criando...": "Creando...",
    "Criar produto": "Crear producto",
    "Comprei mais": "Compré más",
    "Quantidade comprada": "Cantidad comprada",
    "qtd. em {unidade}": "cant. en {unidade}",
    "Total pago": "Total pagado",
    "total {moeda}": "total {moeda}",
    "Registrando...": "Registrando...",
    "Registrar compra": "Registrar compra",
    "O total é o que você pagou pela quantidade toda. O custo por {unidade} sai daí e passa a valer para a margem de todos os serviços que usam este produto.":
      "El total es lo que pagaste por toda la cantidad. El costo por {unidade} sale de ahí y pasa a contar para el margen de todos los servicios que usan este producto.",
    "Corrigir o estoque": "Corregir el inventario",
    "O ajuste soma ou subtrai": "El ajuste suma o resta",
    "Tirar": "Quitar",
    "Adicionar": "Añadir",
    "Quantidade do ajuste": "Cantidad del ajuste",
    "Motivo do ajuste": "Motivo del ajuste",
    "motivo (ex.: derramei)": "motivo (ej.: se derramó)",
    "Ajustando...": "Ajustando...",
    "Ajustar": "Ajustar",
    "Quantidade gasta em {servico}": "Cantidad usada en {servico}",
    "Serviço a ligar": "Servicio a vincular",
    "Quantidade gasta por execução": "Cantidad usada por ejecución",
    "Ligando...": "Vinculando...",
    "Ligar serviço": "Vincular servicio",
    "Serviços que gastam este produto": "Servicios que usan este producto",
    "Nenhum. Enquanto nenhum serviço gastar este produto, o estoque só muda quando você registra compras ou ajustes à mão.":
      "Ninguno. Mientras ningún servicio use este producto, el inventario solo cambia cuando registras compras o ajustes a mano.",
    "Colocar a quantidade em zero tira o serviço desta lista.":
      "Poner la cantidad en cero quita el servicio de esta lista.",
    "Excluir produto": "Eliminar producto",
    'Excluir "{nome}"? O estoque e o histórico ficam guardados e você pode restaurá-lo.':
      '¿Eliminar "{nome}"? El inventario y el historial quedan guardados y puedes restaurarlo.',
    'Excluir "{nome}"? Sai também da receita de {n} serviço, e essas quantidades não voltam se você restaurá-lo.':
      '¿Eliminar "{nome}"? También sale de la receta de {n} servicio, y esas cantidades no vuelven si lo restauras.',
    'Excluir "{nome}"? Sai também da receita de {n} serviços, e essas quantidades não voltam se você restaurá-lo.':
      '¿Eliminar "{nome}"? También sale de la receta de {n} servicios, y esas cantidades no vuelven si lo restauras.',

    // ---- Campañas
    "Sem gasto registrado no período.": "Sin gasto registrado en el período.",
    "{n} contato": "{n} contacto",
    "{n} contatos": "{n} contactos",
    "Sem campanhas com gasto no período.": "Sin campañas con gasto en el período.",
    "{cliques} cliques · {impressoes} impressões": "{cliques} clics · {impressoes} impresiones",
    "{n} contato identificado": "{n} contacto identificado",
    "{n} contatos identificados": "{n} contactos identificados",
    "{n} agendamento": "{n} cita",
    "{n} agendamentos": "{n} citas",
    "Período": "Período",
    "Hoje": "Hoy",
    "Esta semana": "Esta semana",
    "Este mês": "Este mes",
    "Personalizada": "Personalizado",
    "Início": "Inicio",
    "Fim": "Fin",
    "Aplicando...": "Aplicando...",
    "Aplicar": "Aplicar",
    "no período": "en el período",
    "Investimento": "Inversión",
    "Soma do que a Meta cobrou nos dias do período, no fuso da conta de anúncios.":
      "Suma de lo que Meta cobró en los días del período, en la zona horaria de la cuenta publicitaria.",
    "Investido": "Invertido",
    "Pessoas que entraram em contato no período, por qualquer via, não só por anúncio.":
      "Personas que se pusieron en contacto en el período, por cualquier vía, no solo por anuncio.",
    "Contatos novos": "Contactos nuevos",
    "Investido dividido pelos contatos novos. É um limite superior do custo real por lead de anúncio.":
      "Lo invertido dividido entre los contactos nuevos. Es un límite superior del costo real por lead de anuncio.",
    "Custo por contato": "Costo por contacto",
    "Cliques em qualquer parte do anúncio.": "Clics en cualquier parte del anuncio.",
    "Cliques": "Clics",
    "{n} no link": "{n} en el enlace",
    "Entrega": "Entrega",
    "Impressões servidas no período. Uma pessoa pode ver o anúncio várias vezes.":
      "Impresiones servidas en el período. Una persona puede ver el anuncio varias veces.",
    "Impressões": "Impresiones",
    "Custo por mil impressões, recalculado do total do período.":
      "Costo por mil impresiones, recalculado con el total del período.",
    "Cliques divididos pelas impressões, recalculado do total do período.":
      "Clics divididos entre las impresiones, recalculado del total del período.",
    "Gasto por dia": "Gasto por día",
    "Passe o mouse sobre uma barra para ver o gasto e os contatos daquele dia.":
      "Pasa el cursor sobre una barra para ver el gasto y los contactos de ese día.",
    "Gasto por campanha": "Gasto por campaña",
    "por investimento": "por inversión",
    'Por que não existe "custo por mensagem" por campanha':
      'Por qué no existe "costo por mensaje" por campaña',
    "A Meta não devolve conversas iniciadas nesta conta: os conjuntos que otimizam conversas enviam as pessoas para o Instagram Direct, que não identifica o anúncio de origem. Por isso o custo acima é calculado sobre todos os contatos novos, e não só sobre os que vieram de anúncio. Serve para comparar períodos, não para afirmar o custo exato de um lead pago.":
      "Meta no devuelve conversaciones iniciadas en esta cuenta: los conjuntos que optimizan conversaciones envían a las personas a Instagram Direct, que no identifica el anuncio de origen. Por eso el costo de arriba se calcula sobre todos los contactos nuevos, y no solo sobre los que vinieron de un anuncio. Sirve para comparar períodos, no para afirmar el costo exacto de un lead pagado.",
    "Os contatos identificados por campanha vêm da mesma limitação: {com} de {total} contatos novos do período trazem o anúncio de origem. Só o clique para WhatsApp o envia. É um mínimo garantido, não um total: vale para comparar campanhas entre si, porque a regra falha igual em todas, e não vale para dizer que fatia dos contatos veio de anúncio pago.":
      "Los contactos identificados por campaña tienen la misma limitación: {com} de {total} contactos nuevos del período traen el anuncio de origen. Solo el clic a WhatsApp lo envía. Es un mínimo garantizado, no un total: sirve para comparar campañas entre sí, porque la regla falla igual en todas, y no sirve para decir qué parte de los contactos vino de anuncios pagados.",
    "Ainda não há dados de campanhas": "Aún no hay datos de campañas",
    "Puxando...": "Obteniendo...",
    "Atualizar": "Actualizar",
    "Puxando da Meta...": "Obteniendo de Meta...",
    "Atualizar dados": "Actualizar datos",
    "Última atualização: {data}": "Última actualización: {data}",
    "Nunca atualizado.": "Nunca actualizado.",

    // ---- Páginas
    "Serviços e margem": "Servicios y margen",
    "Serviços": "Servicios",
    "Produtos e estoque": "Productos e inventario",
    "Produtos": "Productos",
    "Campanhas": "Campañas",
    'Clique em "Atualizar dados" para puxar o histórico da Meta. Se continuar vazio, a conta de anúncios ainda não está ligada a esta empresa.':
      'Haz clic en "Actualizar datos" para traer el historial de Meta. Si sigue vacío, la cuenta publicitaria aún no está conectada a esta empresa.',
    "Não foi possível buscar os clientes.": "No se pudieron obtener los clientes.",
    "Nenhum cliente ativo disponível.": "No hay ningún cliente activo disponible.",
    "Cliente": "Cliente",
    "(sem catálogo ligado)": "(sin catálogo conectado)",
    "Selecionar": "Seleccionar",
    "(sem conta ligada)": "(sin cuenta conectada)",
    'Este cliente tem conta de anúncios ligada, mas ainda não há gasto salvo. Clique em "Atualizar dados" para puxar o histórico da Meta.':
      'Este cliente tiene la cuenta publicitaria conectada, pero aún no hay gasto guardado. Haz clic en "Actualizar datos" para traer el historial de Meta.',
    "Este cliente não tem conta de anúncios ligada. Faltam as variáveis de ambiente {variaveis}.":
      "Este cliente no tiene cuenta publicitaria conectada. Faltan las variables de entorno {variaveis}.",
    "e": "y",
    "Este cliente não tem conta de anúncios ligada. Falta a variável de ambiente {variavel}.":
      "Este cliente no tiene cuenta publicitaria conectada. Falta la variable de entorno {variavel}.",

    // ---- Mensajes
    "Sessão sem permissão para editar serviços.": "Sesión sin permiso para editar servicios.",
    "Sessão sem permissão para editar produtos.": "Sesión sin permiso para editar productos.",
    "Sessão sem permissão para atualizar campanhas.": "Sesión sin permiso para actualizar campañas.",
    "Serviço não identificado.": "Servicio no identificado.",
    "Produto não identificado.": "Producto no identificado.",
    "Produto ou serviço não identificado.": "Producto o servicio no identificado.",
    "Escolha um cliente primeiro.": "Elige un cliente primero.",
    "Cliente desconhecido.": "Cliente desconocido.",
    "Os dados foram puxados há menos de um minuto. Já estão atualizados.":
      "Los datos se obtuvieron hace menos de un minuto. Ya están actualizados.",
    "Atualizado: {dias} dias de {campanhas} campanhas.":
      "Actualizado: {dias} días de {campanhas} campañas.",
    "Não foi possível atualizar agora. Tente de novo em instantes.":
      "No se pudo actualizar ahora. Inténtalo de nuevo en unos instantes.",
    "Este cliente não tem painel de serviços.": "Este cliente no tiene panel de servicios.",
    "Credenciais do banco de dados do cliente não configuradas.":
      "Las credenciales de la base de datos del cliente no están configuradas.",
    "As notas estão longas demais.": "Las notas son demasiado largas.",
    "Não foi possível ler o serviço.": "No se pudo leer el servicio.",
    "Serviço desconhecido.": "Servicio desconocido.",
    "Não foi possível salvar as notas.": "No se pudieron guardar las notas.",
    'Notas de "{nome}" salvas.': 'Notas de "{nome}" guardadas.',
    "Notas salvas, mas o preço não: preencha o preço.":
      "Notas guardadas, pero el precio no: completa el precio.",
    "Notas salvas, mas o preço não: tem de ser um número igual ou maior que zero.":
      "Notas guardadas, pero el precio no: tiene que ser un número igual o mayor que cero.",
    "Notas salvas, mas o preço não: está fora do intervalo aceitável.":
      "Notas guardadas, pero el precio no: está fuera del rango aceptable.",
    "Notas salvas, mas o preço não foi alterado.": "Notas guardadas, pero el precio no se cambió.",
    '"{nome}" não foi restaurado: o catálogo recusou a gravação.':
      '"{nome}" no se restauró: el catálogo rechazó el cambio.',
    '"{nome}" não foi excluído: o catálogo recusou a gravação.':
      '"{nome}" no se eliminó: el catálogo rechazó el cambio.',
    '"{nome}" foi restaurado no catálogo, mas não foi possível confirmar a linha de agendamento. Verifique {tabela} no Supabase.':
      '"{nome}" se restauró en el catálogo, pero no se pudo confirmar la fila de agenda. Revisa {tabela} en Supabase.',
    '"{nome}" foi excluído no catálogo, mas não foi possível confirmar a linha de agendamento. Verifique {tabela} no Supabase.':
      '"{nome}" se eliminó en el catálogo, pero no se pudo confirmar la fila de agenda. Revisa {tabela} en Supabase.',
    '"{nome}" restaurado. Não tinha linha em {tabela}, por isso só o catálogo mudou.':
      '"{nome}" restaurado. No tenía fila en {tabela}, por eso solo cambió el catálogo.',
    '"{nome}" excluído. Não tinha linha em {tabela}, por isso só o catálogo mudou.':
      '"{nome}" eliminado. No tenía fila en {tabela}, por eso solo cambió el catálogo.',
    '"{nome}" foi restaurado no catálogo, mas a tabela de agendamento recusou a gravação. Verifique {tabela} no Supabase.':
      '"{nome}" se restauró en el catálogo, pero la tabla de agenda rechazó el cambio. Revisa {tabela} en Supabase.',
    '"{nome}" foi excluído no catálogo, mas a tabela de agendamento recusou a gravação. Verifique {tabela} no Supabase.':
      '"{nome}" se eliminó en el catálogo, pero la tabla de agenda rechazó el cambio. Revisa {tabela} en Supabase.',
    '"{nome}" restaurado: volta a ser vendido pelo agente e a aceitar agendamentos.':
      '"{nome}" restaurado: el agente vuelve a venderlo y vuelve a aceptar citas.',
    '"{nome}" excluído: sai do painel e o agente deixa de vendê-lo. Você pode restaurá-lo logo abaixo.':
      '"{nome}" eliminado: sale del panel y el agente deja de venderlo. Puedes restaurarlo más abajo.',
    "Preço não alterado: não foi possível confirmar a linha de agendamento.":
      "Precio sin cambios: no se pudo confirmar la fila de agenda.",
    'Preço não alterado: "{nome}" não tem linha em {tabela}, e mudar só o catálogo faria o agente vender um preço que o agendamento não cobra.':
      'Precio sin cambios: "{nome}" no tiene fila en {tabela}, y cambiar solo el catálogo haría que el agente venda un precio que la agenda no cobra.',
    "Preço não alterado: a tabela de agendamento recusou a gravação.":
      "Precio sin cambios: la tabla de agenda rechazó el cambio.",
    '"{nome}" salvo: preço atualizado nas duas tabelas do cliente.':
      '"{nome}" guardado: precio actualizado en las dos tablas del cliente.',
    "O preço ficou salvo só no catálogo e não foi possível desfazer. Verifique o serviço no Supabase antes de salvar de novo.":
      "El precio quedó guardado solo en el catálogo y no se pudo deshacer. Revisa el servicio en Supabase antes de volver a guardar.",
    "Preencha quanto você pagou.": "Indica cuánto pagaste.",
    "O valor pago tem de ser um número maior que zero.":
      "El valor pagado tiene que ser un número mayor que cero.",
    "O valor pago está fora do intervalo aceitável.": "El valor pagado está fuera del rango aceptable.",
    "Preencha a quantidade.": "Completa la cantidad.",
    "A quantidade tem de ser um número maior que zero.":
      "La cantidad tiene que ser un número mayor que cero.",
    "A quantidade está fora do intervalo aceitável.": "La cantidad está fuera del rango aceptable.",
    "Preencha a quantidade comprada.": "Completa la cantidad comprada.",
    "A quantidade comprada tem de ser um número maior que zero.":
      "La cantidad comprada tiene que ser un número mayor que cero.",
    "A quantidade comprada está fora do intervalo aceitável.":
      "La cantidad comprada está fuera del rango aceptable.",
    "Este cliente não tem catálogo de serviços ligado.":
      "Este cliente no tiene un catálogo de servicios conectado.",
    "Dê um nome ao produto.": "Ponle un nombre al producto.",
    "Escolha uma unidade válida.": "Elige una unidad válida.",
    'Já existe um produto chamado "{nome}".': 'Ya existe un producto llamado "{nome}".',
    "Não foi possível criar o produto.": "No se pudo crear el producto.",
    '"{nome}" criado.': '"{nome}" creado.',
    "Quantidade inválida.": "Cantidad no válida.",
    "Valor inválido.": "Valor no válido.",
    "Produto desconhecido.": "Producto desconocido.",
    "Não foi possível registrar a compra.": "No se pudo registrar la compra.",
    "Compra registrada: {quantidade} {unidade} de {produto} a {unitario} €/{unidade}.":
      "Compra registrada: {quantidade} {unidade} de {produto} a {unitario} €/{unidade}.",
    "Escolha se o ajuste soma ou subtrai.": "Elige si el ajuste suma o resta.",
    "Não foi possível registrar o ajuste.": "No se pudo registrar el ajuste.",
    "Estoque de {produto} ajustado.": "Inventario de {produto} ajustado.",
    "Não foi possível tirar o produto das receitas dos serviços.":
      "No se pudo quitar el producto de las recetas de los servicios.",
    "Não foi possível excluir o produto.": "No se pudo eliminar el producto.",
    '"{nome}" excluído. O histórico fica guardado e você pode restaurá-lo logo abaixo.':
      '"{nome}" eliminado. El historial queda guardado y puedes restaurarlo más abajo.',
    '"{nome}" excluído e tirado de {n} serviço. Se você restaurá-lo, a quantidade em cada serviço precisa ser definida de novo.':
      '"{nome}" eliminado y quitado de {n} servicio. Si lo restauras, tendrás que volver a definir la cantidad en cada servicio.',
    '"{nome}" excluído e tirado de {n} serviços. Se você restaurá-lo, a quantidade em cada serviço precisa ser definida de novo.':
      '"{nome}" eliminado y quitado de {n} servicios. Si lo restauras, tendrás que volver a definir la cantidad en cada servicio.',
    "Não foi possível restaurar o produto.": "No se pudo restaurar el producto.",
    '"{nome}" restaurado. Diga de novo quanto cada serviço gasta dele.':
      '"{nome}" restaurado. Vuelve a indicar cuánto usa cada servicio.',
    '"{nome}" está excluído. Restaure-o na página Produtos antes de usá-lo num serviço.':
      '"{nome}" está eliminado. Restáuralo en la página Productos antes de usarlo en un servicio.',
    "Não foi possível remover o produto.": "No se pudo quitar el producto.",
    '{produto} saiu da receita de "{servico}".': '{produto} salió de la receta de "{servico}".',
    "Não foi possível salvar a receita.": "No se pudo guardar la receta.",
    '"{servico}" passa a gastar {quantidade} {unidade} de {produto}.':
      '"{servico}" pasa a usar {quantidade} {unidade} de {produto}.',
    "Não foi possível ler a receita do serviço.": "No se pudo leer la receta del servicio.",
    '"{servico}" ainda não tem produtos associados, nada para descontar.':
      '"{servico}" aún no tiene productos asociados, no hay nada que descontar.',
    "Não foi possível descontar do estoque.": "No se pudo descontar del inventario.",
    '"{servico}" registrado: {n} produto descontado do estoque.':
      '"{servico}" registrado: {n} producto descontado del inventario.',
    '"{servico}" registrado: {n} produtos descontados do estoque.':
      '"{servico}" registrado: {n} productos descontados del inventario.',
  },

  en: {
    // ---- Services: panel
    "preço único": "single price",
    "preço base": "base price",
    "preço deste escalão": "price for this tier",
    "preço único, não varia com o veículo": "single price, doesn't vary by vehicle",
    "não é cobrado por escalão, mostra o base": "not charged by tier, showing the base",
    "sem preço definido para este escalão, mostra o base":
      "no price set for this tier, showing the base",
    "Não executa este serviço.": "Doesn't perform this service.",
    "Rende {valor} por hora ocupada.": "Earns {valor} per booked hour.",
    "Custo de produto": "Product cost",
    "Margem": "Margin",
    "Produtos na receita": "Products in the recipe",
    "Preço base": "Base price",
    "executor": "staff member",
    "Escalão de viatura": "Vehicle tier",
    "Todos os serviços já têm produtos associados.": "Every service already has products linked.",
    "{n} ainda sem produtos associados: marcar esses como realizados não desconta nada.":
      "{n} still without linked products: marking them as done doesn't deduct anything.",
    "Serviços ativos": "Active services",
    "{servico}: o que mais rende por hora ocupada de {executor}.":
      "{servico}: earns the most per booked hour for {executor}.",
    "Faltam durações ou preços para comparar.": "Missing durations or prices to compare.",
    "Melhor receita/hora": "Best revenue/hour",
    "{servico}: ocupa horas de {executor} e rende menos por hora.":
      "{servico}: takes up {executor}'s hours and earns the least per hour.",
    "Pior receita/hora": "Worst revenue/hour",
    "Ainda não há produtos registrados.": "No products recorded yet.",
    "O custo de produto de cada serviço sai da lista de produtos que ele gasta. Comece registrando os produtos e as compras na página Produtos; depois volte aqui e diga quanto cada serviço gasta de cada um.":
      "Each service's product cost comes from the list of products it uses. Start by recording the products and purchases on the Products page; then come back here and say how much of each one every service uses.",
    "Sem categoria": "No category",
    "Não variam com o veículo. A margem é calculada sobre o preço base.":
      "They don't vary by vehicle. The margin is calculated on the base price.",
    "A margem é calculada sobre o preço base.": "The margin is calculated on the base price.",
    "Outros preços deste serviço": "Other prices for this service",
    "Nota do catálogo": "Catalog note",
    "Este serviço existe no catálogo de venda mas não tem linha de agendamento, então não tem duração. Confirme se é intencional.":
      "This service is in the sales catalog but has no booking row, so it has no duration. Check whether that's intentional.",
    "O preço está diferente nas duas tabelas do cliente: o catálogo diz {catalogo} e o agendamento diz {agendamento}. Salvar o preço aqui volta a alinhar os dois.":
      "The price differs between the client's two tables: the catalog says {catalogo} and booking says {agendamento}. Saving the price here brings them back in line.",
    "Há produtos nesta receita sem compra registrada, por isso ainda não têm preço. O custo e a margem ficam vazios até você registrar quanto pagou por eles na página Produtos: somar só os que têm preço daria uma margem melhor do que a real.":
      "Some products in this recipe have no recorded purchase, so they have no price yet. Cost and margin stay empty until you record what you paid for them on the Products page: adding up only the priced ones would show a better margin than the real one.",
    "Continuam no banco de dados com preço, notas, receita e histórico. Só o agente é que deixou de vendê-los.":
      "They stay in the database with price, notes, recipe and history. Only the agent stopped selling them.",
    "Excluídos": "Deleted",
    "Não foi possível ler o catálogo de serviços.": "Couldn't read the service catalog.",
    "Sem serviços activos.": "No active services.",
    "Sem serviços activos no catálogo.": "No active services in the catalog.",
    "Este cliente ainda não tem catálogo de serviços ligado ao painel.":
      "This client doesn't have a service catalog connected to the dashboard yet.",
    "Credenciais da base de dados do cliente não configuradas no servidor.":
      "The client's database credentials aren't configured on the server.",

    // ---- Services: forms
    "Excluir serviço": "Delete service",
    'Excluir "{nome}"? O agente deixa de vendê-lo e o agendamento deixa de aceitá-lo. O preço, a receita e o histórico ficam guardados, e você pode restaurá-lo logo abaixo.':
      'Delete "{nome}"? The agent stops selling it and booking stops accepting it. The price, recipe and history are kept, and you can restore it below.',
    "Cancelar": "Cancel",
    "Excluindo...": "Deleting...",
    "Sim, excluir": "Yes, delete",
    "Restaurando...": "Restoring...",
    "Restaurar": "Restore",
    "Descontando...": "Deducting...",
    "Realizei este serviço": "I did this service",
    "Preço base ({moeda})": "Base price ({moeda})",
    "0,00": "0.00",
    "só no escalão base": "only on the base tier",
    "Notas": "Notes",
    "ex.: 1/3 de frasco de cerâmico": "e.g. 1/3 of a ceramic bottle",
    "Salvando...": "Saving...",
    "Salvar": "Save",
    "Quantidade de {produto}": "Amount of {produto}",
    "sem preço": "no price",
    "Produto a adicionar": "Product to add",
    "Quantidade gasta": "Amount used",
    "Adicionando...": "Adding...",
    "Adicionar à receita": "Add to recipe",
    "Produtos gastos neste serviço": "Products used in this service",
    "Nenhum ainda. Enquanto esta lista estiver vazia, marcar o serviço como realizado não desconta nada do estoque.":
      "None yet. While this list is empty, marking the service as done doesn't deduct anything from stock.",

    // ---- Products
    "Você ainda não registrou nenhum serviço com este produto.":
      "You haven't recorded any service with this product yet.",
    "Falta mais uma execução registrada para haver ritmo de consumo.":
      "One more recorded service is needed to get a usage rate.",
    "Sem consumo medido.": "No measured usage.",
    "Acabou. O estoque está zerado ou negativo.": "Ran out. Stock is at zero or negative.",
    "No ritmo de {quantidade} {unidade} por dia, medido desde a primeira saída.":
      "At {quantidade} {unidade} per day, measured since the first use.",
    "Compra": "Purchase",
    "Consumo": "Usage",
    "Ajuste": "Adjustment",
    "Novo produto": "New product",
    "Ainda não há produtos. Crie o primeiro acima.": "No products yet. Create the first one above.",
    "em estoque": "in stock",
    "Custo por {unidade}": "Cost per {unidade}",
    "Valor do estoque": "Stock value",
    "Dura mais": "Lasts",
    "{n} dia": "{n} day",
    "{n} dias": "{n} days",
    "Sem compra registrada, este produto não tem preço, e os serviços que o usam ficam sem custo e sem margem. Registre abaixo quanto você pagou da última vez que o comprou.":
      "With no recorded purchase, this product has no price, and the services that use it have no cost and no margin. Record below what you paid the last time you bought it.",
    "Últimos movimentos": "Recent movements",
    "O estoque e as compras destes produtos continuam guardados. Restaurar traz o produto de volta, mas não as quantidades por serviço.":
      "The stock and purchases of these products are kept. Restoring brings the product back, but not the amounts per service.",
    "Nome do produto": "Product name",
    "ex.: Cerâmico 4 anos": "e.g. 4-year ceramic",
    "Unidade": "Unit",
    "opcional": "optional",
    "Criando...": "Creating...",
    "Criar produto": "Create product",
    "Comprei mais": "I bought more",
    "Quantidade comprada": "Amount bought",
    "qtd. em {unidade}": "qty in {unidade}",
    "Total pago": "Total paid",
    "total {moeda}": "total {moeda}",
    "Registrando...": "Recording...",
    "Registrar compra": "Record purchase",
    "O total é o que você pagou pela quantidade toda. O custo por {unidade} sai daí e passa a valer para a margem de todos os serviços que usam este produto.":
      "The total is what you paid for the whole amount. The cost per {unidade} comes from that and is used for the margin of every service that uses this product.",
    "Corrigir o estoque": "Correct the stock",
    "O ajuste soma ou subtrai": "The adjustment adds or subtracts",
    "Tirar": "Remove",
    "Adicionar": "Add",
    "Quantidade do ajuste": "Adjustment amount",
    "Motivo do ajuste": "Reason for adjustment",
    "motivo (ex.: derramei)": "reason (e.g. spilled)",
    "Ajustando...": "Adjusting...",
    "Ajustar": "Adjust",
    "Quantidade gasta em {servico}": "Amount used in {servico}",
    "Serviço a ligar": "Service to link",
    "Quantidade gasta por execução": "Amount used per service",
    "Ligando...": "Linking...",
    "Ligar serviço": "Link service",
    "Serviços que gastam este produto": "Services that use this product",
    "Nenhum. Enquanto nenhum serviço gastar este produto, o estoque só muda quando você registra compras ou ajustes à mão.":
      "None. Until a service uses this product, stock only changes when you record purchases or manual adjustments.",
    "Colocar a quantidade em zero tira o serviço desta lista.":
      "Setting the amount to zero removes the service from this list.",
    "Excluir produto": "Delete product",
    'Excluir "{nome}"? O estoque e o histórico ficam guardados e você pode restaurá-lo.':
      'Delete "{nome}"? The stock and history are kept and you can restore it.',
    'Excluir "{nome}"? Sai também da receita de {n} serviço, e essas quantidades não voltam se você restaurá-lo.':
      'Delete "{nome}"? It also leaves the recipe of {n} service, and those amounts won\'t come back if you restore it.',
    'Excluir "{nome}"? Sai também da receita de {n} serviços, e essas quantidades não voltam se você restaurá-lo.':
      'Delete "{nome}"? It also leaves the recipe of {n} services, and those amounts won\'t come back if you restore it.',

    // ---- Campaigns
    "Sem gasto registrado no período.": "No spend recorded in this period.",
    "{n} contato": "{n} contact",
    "{n} contatos": "{n} contacts",
    "Sem campanhas com gasto no período.": "No campaigns with spend in this period.",
    "{cliques} cliques · {impressoes} impressões": "{cliques} clicks · {impressoes} impressions",
    "{n} contato identificado": "{n} contact identified",
    "{n} contatos identificados": "{n} contacts identified",
    "{n} agendamento": "{n} booking",
    "{n} agendamentos": "{n} bookings",
    "Período": "Period",
    "Hoje": "Today",
    "Esta semana": "This week",
    "Este mês": "This month",
    "Personalizada": "Custom",
    "Início": "Start",
    "Fim": "End",
    "Aplicando...": "Applying...",
    "Aplicar": "Apply",
    "no período": "in this period",
    "Investimento": "Investment",
    "Soma do que a Meta cobrou nos dias do período, no fuso da conta de anúncios.":
      "Total Meta charged on the days in this period, in the ad account's time zone.",
    "Investido": "Spent",
    "Pessoas que entraram em contato no período, por qualquer via, não só por anúncio.":
      "People who got in touch during the period, through any channel, not just ads.",
    "Contatos novos": "New contacts",
    "Investido dividido pelos contatos novos. É um limite superior do custo real por lead de anúncio.":
      "Spend divided by new contacts. It's an upper bound on the real cost per ad lead.",
    "Custo por contato": "Cost per contact",
    "Cliques em qualquer parte do anúncio.": "Clicks anywhere on the ad.",
    "Cliques": "Clicks",
    "{n} no link": "{n} on the link",
    "Entrega": "Delivery",
    "Impressões servidas no período. Uma pessoa pode ver o anúncio várias vezes.":
      "Impressions served in the period. One person can see the ad several times.",
    "Impressões": "Impressions",
    "Custo por mil impressões, recalculado do total do período.":
      "Cost per thousand impressions, recalculated from the period total.",
    "Cliques divididos pelas impressões, recalculado do total do período.":
      "Clicks divided by impressions, recalculated from the period total.",
    "Gasto por dia": "Spend per day",
    "Passe o mouse sobre uma barra para ver o gasto e os contatos daquele dia.":
      "Hover over a bar to see that day's spend and contacts.",
    "Gasto por campanha": "Spend per campaign",
    "por investimento": "by spend",
    'Por que não existe "custo por mensagem" por campanha':
      'Why there\'s no "cost per message" per campaign',
    "A Meta não devolve conversas iniciadas nesta conta: os conjuntos que otimizam conversas enviam as pessoas para o Instagram Direct, que não identifica o anúncio de origem. Por isso o custo acima é calculado sobre todos os contatos novos, e não só sobre os que vieram de anúncio. Serve para comparar períodos, não para afirmar o custo exato de um lead pago.":
      "Meta doesn't report conversations started for this account: the ad sets that optimize for conversations send people to Instagram Direct, which doesn't identify the source ad. That's why the cost above is calculated over all new contacts, not just the ones that came from ads. Use it to compare periods, not to state the exact cost of a paid lead.",
    "Os contatos identificados por campanha vêm da mesma limitação: {com} de {total} contatos novos do período trazem o anúncio de origem. Só o clique para WhatsApp o envia. É um mínimo garantido, não um total: vale para comparar campanhas entre si, porque a regra falha igual em todas, e não vale para dizer que fatia dos contatos veio de anúncio pago.":
      "Contacts identified per campaign have the same limitation: {com} of {total} new contacts in the period carry the source ad. Only click-to-WhatsApp sends it. It's a guaranteed minimum, not a total: it works for comparing campaigns with each other, since the rule fails the same way for all of them, but not for saying what share of contacts came from paid ads.",
    "Ainda não há dados de campanhas": "No campaign data yet",
    "Puxando...": "Fetching...",
    "Atualizar": "Refresh",
    "Puxando da Meta...": "Fetching from Meta...",
    "Atualizar dados": "Refresh data",
    "Última atualização: {data}": "Last updated: {data}",
    "Nunca atualizado.": "Never updated.",

    // ---- Pages
    "Serviços e margem": "Services and margin",
    "Serviços": "Services",
    "Produtos e estoque": "Products and stock",
    "Produtos": "Products",
    "Campanhas": "Campaigns",
    'Clique em "Atualizar dados" para puxar o histórico da Meta. Se continuar vazio, a conta de anúncios ainda não está ligada a esta empresa.':
      'Click "Refresh data" to pull the history from Meta. If it stays empty, the ad account isn\'t connected to this business yet.',
    "Não foi possível buscar os clientes.": "Couldn't load the customers.",
    "Nenhum cliente ativo disponível.": "No active client available.",
    "Cliente": "Customer",
    "(sem catálogo ligado)": "(no catalog connected)",
    "Selecionar": "Select",
    "(sem conta ligada)": "(no account connected)",
    'Este cliente tem conta de anúncios ligada, mas ainda não há gasto salvo. Clique em "Atualizar dados" para puxar o histórico da Meta.':
      'This client has an ad account connected, but no spend saved yet. Click "Refresh data" to pull the history from Meta.',
    "Este cliente não tem conta de anúncios ligada. Faltam as variáveis de ambiente {variaveis}.":
      "This client has no ad account connected. Missing environment variables {variaveis}.",
    "e": "and",
    "Este cliente não tem conta de anúncios ligada. Falta a variável de ambiente {variavel}.":
      "This client has no ad account connected. Missing environment variable {variavel}.",

    // ---- Messages
    "Sessão sem permissão para editar serviços.": "This session isn't allowed to edit services.",
    "Sessão sem permissão para editar produtos.": "This session isn't allowed to edit products.",
    "Sessão sem permissão para atualizar campanhas.":
      "This session isn't allowed to refresh campaigns.",
    "Serviço não identificado.": "Service not identified.",
    "Produto não identificado.": "Product not identified.",
    "Produto ou serviço não identificado.": "Product or service not identified.",
    "Escolha um cliente primeiro.": "Choose a client first.",
    "Cliente desconhecido.": "Unknown client.",
    "Os dados foram puxados há menos de um minuto. Já estão atualizados.":
      "The data was fetched less than a minute ago. It's already up to date.",
    "Atualizado: {dias} dias de {campanhas} campanhas.":
      "Updated: {dias} days from {campanhas} campaigns.",
    "Não foi possível atualizar agora. Tente de novo em instantes.":
      "Couldn't refresh right now. Try again in a moment.",
    "Este cliente não tem painel de serviços.": "This client doesn't have a services panel.",
    "Credenciais do banco de dados do cliente não configuradas.":
      "The customer's database credentials aren't configured.",
    "As notas estão longas demais.": "The notes are too long.",
    "Não foi possível ler o serviço.": "Couldn't read the service.",
    "Serviço desconhecido.": "Unknown service.",
    "Não foi possível salvar as notas.": "Couldn't save the notes.",
    'Notas de "{nome}" salvas.': 'Notes for "{nome}" saved.',
    "Notas salvas, mas o preço não: preencha o preço.":
      "Notes saved, but not the price: fill in the price.",
    "Notas salvas, mas o preço não: tem de ser um número igual ou maior que zero.":
      "Notes saved, but not the price: it must be a number equal to or greater than zero.",
    "Notas salvas, mas o preço não: está fora do intervalo aceitável.":
      "Notes saved, but not the price: it's outside the accepted range.",
    "Notas salvas, mas o preço não foi alterado.": "Notes saved, but the price wasn't changed.",
    '"{nome}" não foi restaurado: o catálogo recusou a gravação.':
      '"{nome}" wasn\'t restored: the catalog rejected the change.',
    '"{nome}" não foi excluído: o catálogo recusou a gravação.':
      '"{nome}" wasn\'t deleted: the catalog rejected the change.',
    '"{nome}" foi restaurado no catálogo, mas não foi possível confirmar a linha de agendamento. Verifique {tabela} no Supabase.':
      '"{nome}" was restored in the catalog, but the booking row couldn\'t be confirmed. Check {tabela} in Supabase.',
    '"{nome}" foi excluído no catálogo, mas não foi possível confirmar a linha de agendamento. Verifique {tabela} no Supabase.':
      '"{nome}" was deleted in the catalog, but the booking row couldn\'t be confirmed. Check {tabela} in Supabase.',
    '"{nome}" restaurado. Não tinha linha em {tabela}, por isso só o catálogo mudou.':
      '"{nome}" restored. It had no row in {tabela}, so only the catalog changed.',
    '"{nome}" excluído. Não tinha linha em {tabela}, por isso só o catálogo mudou.':
      '"{nome}" deleted. It had no row in {tabela}, so only the catalog changed.',
    '"{nome}" foi restaurado no catálogo, mas a tabela de agendamento recusou a gravação. Verifique {tabela} no Supabase.':
      '"{nome}" was restored in the catalog, but the booking table rejected the change. Check {tabela} in Supabase.',
    '"{nome}" foi excluído no catálogo, mas a tabela de agendamento recusou a gravação. Verifique {tabela} no Supabase.':
      '"{nome}" was deleted in the catalog, but the booking table rejected the change. Check {tabela} in Supabase.',
    '"{nome}" restaurado: volta a ser vendido pelo agente e a aceitar agendamentos.':
      '"{nome}" restored: the agent sells it again and it accepts bookings again.',
    '"{nome}" excluído: sai do painel e o agente deixa de vendê-lo. Você pode restaurá-lo logo abaixo.':
      '"{nome}" deleted: it leaves the dashboard and the agent stops selling it. You can restore it below.',
    "Preço não alterado: não foi possível confirmar a linha de agendamento.":
      "Price not changed: the booking row couldn't be confirmed.",
    'Preço não alterado: "{nome}" não tem linha em {tabela}, e mudar só o catálogo faria o agente vender um preço que o agendamento não cobra.':
      'Price not changed: "{nome}" has no row in {tabela}, and changing only the catalog would make the agent sell a price that booking doesn\'t charge.',
    "Preço não alterado: a tabela de agendamento recusou a gravação.":
      "Price not changed: the booking table rejected the change.",
    '"{nome}" salvo: preço atualizado nas duas tabelas do cliente.':
      '"{nome}" saved: price updated in both of the client\'s tables.',
    "O preço ficou salvo só no catálogo e não foi possível desfazer. Verifique o serviço no Supabase antes de salvar de novo.":
      "The price was saved only in the catalog and couldn't be undone. Check the service in Supabase before saving again.",
    "Preencha quanto você pagou.": "Fill in how much you paid.",
    "O valor pago tem de ser um número maior que zero.":
      "The amount paid must be a number greater than zero.",
    "O valor pago está fora do intervalo aceitável.": "The amount paid is outside the accepted range.",
    "Preencha a quantidade.": "Fill in the amount.",
    "A quantidade tem de ser um número maior que zero.": "The amount must be a number greater than zero.",
    "A quantidade está fora do intervalo aceitável.": "The amount is outside the accepted range.",
    "Preencha a quantidade comprada.": "Fill in the amount bought.",
    "A quantidade comprada tem de ser um número maior que zero.":
      "The amount bought must be a number greater than zero.",
    "A quantidade comprada está fora do intervalo aceitável.":
      "The amount bought is outside the accepted range.",
    "Este cliente não tem catálogo de serviços ligado.":
      "This client doesn't have a service catalog connected.",
    "Dê um nome ao produto.": "Give the product a name.",
    "Escolha uma unidade válida.": "Choose a valid unit.",
    'Já existe um produto chamado "{nome}".': 'A product called "{nome}" already exists.',
    "Não foi possível criar o produto.": "Couldn't create the product.",
    '"{nome}" criado.': '"{nome}" created.',
    "Quantidade inválida.": "Invalid amount.",
    "Valor inválido.": "Invalid value.",
    "Produto desconhecido.": "Unknown product.",
    "Não foi possível registrar a compra.": "Couldn't record the purchase.",
    "Compra registrada: {quantidade} {unidade} de {produto} a {unitario} €/{unidade}.":
      "Purchase recorded: {quantidade} {unidade} of {produto} at {unitario} €/{unidade}.",
    "Escolha se o ajuste soma ou subtrai.": "Choose whether the adjustment adds or subtracts.",
    "Não foi possível registrar o ajuste.": "Couldn't record the adjustment.",
    "Estoque de {produto} ajustado.": "Stock of {produto} adjusted.",
    "Não foi possível tirar o produto das receitas dos serviços.":
      "Couldn't remove the product from the service recipes.",
    "Não foi possível excluir o produto.": "Couldn't delete the product.",
    '"{nome}" excluído. O histórico fica guardado e você pode restaurá-lo logo abaixo.':
      '"{nome}" deleted. The history is kept and you can restore it below.',
    '"{nome}" excluído e tirado de {n} serviço. Se você restaurá-lo, a quantidade em cada serviço precisa ser definida de novo.':
      '"{nome}" deleted and removed from {n} service. If you restore it, the amount for each service has to be set again.',
    '"{nome}" excluído e tirado de {n} serviços. Se você restaurá-lo, a quantidade em cada serviço precisa ser definida de novo.':
      '"{nome}" deleted and removed from {n} services. If you restore it, the amount for each service has to be set again.',
    "Não foi possível restaurar o produto.": "Couldn't restore the product.",
    '"{nome}" restaurado. Diga de novo quanto cada serviço gasta dele.':
      '"{nome}" restored. Set again how much of it each service uses.',
    '"{nome}" está excluído. Restaure-o na página Produtos antes de usá-lo num serviço.':
      '"{nome}" is deleted. Restore it on the Products page before using it in a service.',
    "Não foi possível remover o produto.": "Couldn't remove the product.",
    '{produto} saiu da receita de "{servico}".': '{produto} was removed from the "{servico}" recipe.',
    "Não foi possível salvar a receita.": "Couldn't save the recipe.",
    '"{servico}" passa a gastar {quantidade} {unidade} de {produto}.':
      '"{servico}" now uses {quantidade} {unidade} of {produto}.',
    "Não foi possível ler a receita do serviço.": "Couldn't read the service recipe.",
    '"{servico}" ainda não tem produtos associados, nada para descontar.':
      '"{servico}" has no linked products yet, nothing to deduct.',
    "Não foi possível descontar do estoque.": "Couldn't deduct from stock.",
    '"{servico}" registrado: {n} produto descontado do estoque.':
      '"{servico}" recorded: {n} product deducted from stock.',
    '"{servico}" registrado: {n} produtos descontados do estoque.':
      '"{servico}" recorded: {n} products deducted from stock.',
  },
};

export default textos;
