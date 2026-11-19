# Ferramentas de leitura do Analista (parte 4)

Três ferramentas novas, no mesmo formato das de `lib/ajudante/ferramentas.ts`
(`descricao`, `executar(escopo, args)`, `parametros`, `rotulo`). Ainda NÃO estão
registadas: `ferramentas.ts` e `motor.ts` não foram tocados (outras frentes
mexem neles ao mesmo tempo).

| Nome | Ficheiro | IA? |
|---|---|---|
| `procurar_nas_conversas` | `buscar.ts` | não |
| `analisar_varias_conversas` | `leitura-em-massa.ts` | sim: Haiku 4.5 com a chave do PRÓPRIO cliente, teto 0,30 US$ e 25 conversas |
| `relatorio_do_periodo` | `relatorio.ts` | não |

## Como registar (2 linhas em `lib/ajudante/ferramentas.ts`)

```ts
import { FERRAMENTAS_LEITURA } from "./ferramentas/leitura";

export const FERRAMENTAS: Record<string, Definicao> = {
  // ... as que já existem ...
  ...FERRAMENTAS_LEITURA,
};
```

- Pôr o spread no FIM do objeto: a ordem das ferramentas faz parte do
  prefixo em cache (`ferramentasAnthropic`), e acrescentar no fim só parte o
  cache uma vez.
- O tipo `DefinicaoLeitura` é compatível com `Definicao` (só não devolve
  `proposta`). O import de `Escopo` nestes ficheiros é só de tipo, por isso
  não há ciclo de módulos.
- Os rótulos ("Procurando nas conversas", "Lendo várias conversas",
  "Montando o relatório") já estão traduzidos em `lib/i18n/textos/ajudante.ts`.

## Sugestão para o texto do sistema (`instrucoes` em `motor.ts`), opcional

```
- Para "quem escreveu X" ou "quantos começaram com X", use procurar_nas_conversas (primeira_mensagem=true quando for "começou com").
- Para "porquê" sobre várias pessoas (motivo de cancelamento, objeções), use analisar_varias_conversas; diga quantas conversas leu.
- Para um relatório, use relatorio_do_periodo e mostre-o inteiro a começar pelo título "# ".
```

## Ligar `numeros_do_negocio` ao relatório

Quando a outra frente tiver a função, registá-la uma vez (ex.: no fim do
ficheiro dela ou em `ferramentas.ts`):

```ts
import { usarNumerosDoNegocio } from "./ferramentas/leitura";
usarNumerosDoNegocio(async (escopo, { de, ate }) => /* objeto plano { nome: número } */ null);
```

Os valores numéricos (ou textos curtos) entram na secção "Outros números" do
relatório e em `dados.numeros_do_negocio`. Se a função falhar, o relatório sai
sem essa secção.

## Botão "Copiar relatório"

Em `app/components/ajudante/painel-ajudante.tsx`: aparece debaixo de uma
resposta do Analista que começa por `# ` (só o relatório começa assim). Copia o
texto em markdown. No app do iPhone (`app/m/ajudante/conversa.tsx`) não foi posto.

## Ideias avaliadas

- "Comparar com o mês anterior" e "melhor dia/horário para anunciar": dentro
  do relatório (comparação com o período anterior do mesmo tamanho; dias e
  partes do dia com mais leads).
- "Leads quentes à espera agora": os dados já existem em `dadosHoje().quentes`
  (lib/movel/hoje.ts), mas a ferramenta `hoje` não os devolve. É uma linha em
  `ferramentas.ts` (`quentes: d.quentes`), que não foi tocado aqui.
