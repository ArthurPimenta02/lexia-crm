# Design system Jade + idiomas: como converter uma tela

Este guia é para quem converte uma tela do painel para o novo visual e para os
quatro idiomas. As duas coisas fazem-se de uma vez, ficheiro a ficheiro.

## 1. Idiomas

O texto-fonte é **português do Brasil**. Os dicionários dizem como fica em
pt-PT, espanhol e inglês.

- **Componente de servidor** (sem `"use client"`):
  `import { getT } from "@/lib/i18n/servidor";` e `const t = await getT();`
- **Componente de cliente** (`"use client"`):
  `import { useIdioma } from "@/app/components/idioma";` e
  `const { t, locale } = useIdioma();`
- **Server action** que devolve mensagem para o ecrã: `const t = await getT();`
  dentro da função.
- Variáveis: `t("{n} conversas", { n: total })`. Nunca concatenar pedaços
  traduzidos ("Faltam " + n + " leads") — a ordem das palavras muda entre línguas.
- Prefere `t("texto literal")` (o teste lê-o e confirma a tradução). Para
  rótulos que vêm de uma lista/constante, deixa a constante como está,
  traduz onde se desenha com `t(item.label)`, e põe cada valor possível no
  dicionário da área (o teste não os vê, por isso confere à mão).
- **Se o texto atual estiver em português de Portugal** ("ecrã", "contacto",
  "telemóvel", "activo", "guardar", "está a carregar", "equipa", "utilizador",
  "registo", "ficheiro", "facto", "actual"), a chave passa a ser a versão
  brasileira ("tela", "contato", "celular", "ativo", "salvar", "carregando",
  "equipe", "usuário", "registro", "arquivo", "fato", "atual") e a forma
  portuguesa vai para o dicionário `pt-PT`.
- Datas e números: nada de `"pt-PT"`/`"pt-BR"` escrito à mão. Usa `locale`
  (cliente) ou `LOCALE_DO_IDIOMA[await getIdioma()]` (servidor) em
  `toLocaleString`, `Intl.DateTimeFormat`, `Intl.NumberFormat`.
  O **fuso horário** do cliente continua igual (não mexer).
- Não traduzir: nomes próprios, nomes de canais (WhatsApp, Instagram), dados
  que vêm da base (nomes de serviços, etapas guardadas, mensagens das
  conversas), `aria-hidden` decorativo, código/ids, `console.*`.
- Traduzir também: `aria-label`, `title`, `placeholder`, `alt`, textos de
  `confirm`, mensagens de erro mostradas ao utilizador, opções de `<select>`.
- Cada área escreve **só** no seu ficheiro `lib/i18n/textos/<area>.ts`.
  Antes de inventar uma tradução para uma palavra comum ("Salvar",
  "Cancelar"…), vê se outra área já a traduziu e usa a mesma — o teste
  falha se a mesma chave tiver duas traduções diferentes.

Tom: pt-PT natural de Portugal ("guardar", "ecrã", "telemóvel", "a carregar…").
Espanhol neutro (tú/usted consistente com o resto: **usar "tú"**). Inglês
americano simples. Produto de atendimento para donos de pequenos negócios:
frases curtas, sem jargão.

## 2. Visual (paleta Jade, claro e escuro)

O painel agora tem **modo escuro**. Tudo o que for cor escrita à mão quebra no
escuro (um `bg-white` fica um buraco branco). Regras:

### Cores — usar só tokens

| Em vez de | Usa |
|---|---|
| `bg-white` | `bg-surface` |
| `bg-zinc-50`, `bg-gray-50`, `bg-[#f…]` | `bg-surface-muted` ou `bg-muted` |
| `text-black`, `text-zinc-900` | `text-foreground` |
| `text-zinc-500/600`, `text-gray-*` | `text-muted-foreground` |
| `border-zinc-200`, `border-gray-*` | `border-border` (ou `border-border-strong`) |
| `bg-emerald-50 text-emerald-700`, verdes de sucesso | `bg-positive-soft text-positive` |
| `bg-amber-50 text-amber-700`, laranjas de aviso | `bg-warning-soft text-warning` |
| `bg-red-50 text-red-700 border-red-200`, erros | `bg-danger-soft text-danger border-danger/20` |
| azuis de informação (`bg-blue-50 text-blue-700`, `sky`) | `bg-info-soft text-info` |
| `bg-black`/`bg-zinc-900` em botões | `bg-primary text-primary-foreground` |
| destaque de marca | `text-accent` |

Tokens disponíveis (Tailwind): `background foreground surface surface-muted
border border-strong muted muted-foreground primary primary-foreground
primary-soft accent positive positive-soft warning warning-soft danger
danger-soft info info-soft sidebar…`. **Não existem** `card`, `destructive`,
`popover`, `secondary`, `input` (o teste `avisos-sino` falha se usares).

Exceções que ficam como estão: cores de marca de canais (verde do WhatsApp,
rosa do Instagram, azul da Meta), cores de avatar, cores que vêm da base de
dados (ex.: cor de uma etiqueta guardada pelo cliente).

Overlays escuros (`bg-black/60` atrás de modais) podem ficar.

### Peças (classes de `app/design-system.css`, ou `app/components/ds.tsx`)

- Botão principal: `ds-botao ds-botao-primario` (pílula na cor Jade).
  Secundário: `ds-botao ds-botao-secundario`. Discreto: `ds-botao ds-botao-fantasma`.
  Perigo: `ds-botao ds-botao-perigo`. Tamanhos: `ds-botao-p` (pequeno),
  `ds-botao-g` (grande). Ou o componente `<Botao variante tamanho>`.
  **Mantém** `type`, `disabled`, `onClick`, `formAction` e a largura
  (`w-full` etc.) que o botão tinha.
- Selos/etiquetas: `ds-selo ds-selo-verde|neutro|alerta|perigo|ouro|escuro`
  (+ `ds-selo-ponto` para a bolinha).
- Campos de texto/select: `ds-campo` (mantém altura se precisares de `h-…`).
- Abas/filtros de 2–4 opções: `ds-trilho` com `<button aria-pressed>`.
- Interruptor liga/desliga: `ds-interruptor` (`role="switch" aria-checked`).
- Cartões: o `Card` de `painel-ui.tsx` já foi atualizado; cartões feitos à
  mão: `rounded-2xl border border-border bg-surface` está bem.
- Números grandes (métricas): `ds-numero`. Sobretítulos pequenos em
  maiúsculas: `ds-sobretitulo`.

Não é preciso redesenhar telas. O objetivo é: **tokens em vez de cores à mão,
botões e campos com as peças novas, nada a quebrar no escuro.** Não mudes
lógica, consultas, rotas, nomes de campos de formulário, nem comportamento.

## 3. Verificar antes de dar por feito

```
npx tsc --noEmit
npx eslint <os teus ficheiros>
npx tsx --test --experimental-test-module-mocks tests/idiomas.test.mts tests/avisos-sino.test.mts
```

O teste de idiomas tem de passar para as chaves da tua área (as outras áreas
podem ainda estar a falhar enquanto trabalham — filtra pelos teus ficheiros).
