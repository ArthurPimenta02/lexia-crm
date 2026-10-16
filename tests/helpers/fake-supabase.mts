/**
 * Duplo em memória do cliente da Supabase, só com o que o código do painel usa.
 *
 * Porque é que isto existe: todas as escritas de produtos passam pelo
 * `createAdminClient()`, que é a `service_role`. A `service_role` **ignora o
 * RLS**. Isso quer dizer que a única coisa que impede um cliente de mexer no
 * stock de outro é cada consulta trazer o seu `.eq("cliente_slug", …)` — não há
 * rede de segurança por baixo. É um invariante que vive só no código, e por
 * isso é um invariante que um teste tem de guardar.
 *
 * O duplo aplica os filtros a sério sobre linhas em memória, em vez de os
 * fingir. Se uma consulta se esquecer do filtro do cliente, ela devolve mesmo
 * as linhas da outra empresa, e o teste falha pela razão certa.
 *
 * Também guarda o registo de cada consulta, para se poder afirmar coisas sobre
 * o conjunto todo ("nenhuma consulta a estas tabelas correu sem filtro de
 * cliente") e não só sobre o resultado de uma.
 */

export type Filtro = { coluna: string; valor: unknown; valores?: unknown[] };

export type Registo = {
  colunas: string | null;
  filtros: Filtro[];
  operacao: "delete" | "insert" | "select" | "update" | "upsert";
  payload: unknown;
  tabela: string;
};

export type Linha = Record<string, unknown>;

type Resultado<T> = { data: T; error: { code?: string; message: string } | null };

function correspondeAosFiltros(linha: Linha, filtros: Filtro[]) {
  return filtros.every((filtro) =>
    filtro.valores
      ? filtro.valores.includes(linha[filtro.coluna])
      : linha[filtro.coluna] === filtro.valor,
  );
}

class Consulta implements PromiseLike<Resultado<Linha[] | Linha | null>> {
  private readonly filtros: Filtro[] = [];
  private readonly negacoes: { coluna: string; prefixo: string }[] = [];
  private devolveLinhas = false;
  private limiteLinhas: number | null = null;
  private colunas: string | null = null;

  constructor(
    private readonly base: FakeSupabase,
    private readonly tabela: string,
    private readonly operacao: Registo["operacao"],
    private readonly payload: unknown = null,
    private readonly conflito: string[] = [],
  ) {
    this.devolveLinhas = operacao === "select";
  }

  eq(coluna: string, valor: unknown) {
    this.filtros.push({ coluna, valor });

    return this;
  }

  in(coluna: string, valores: unknown[]) {
    this.filtros.push({ coluna, valor: valores, valores });

    return this;
  }

  /** Só suporta `not(coluna, "like", "prefixo%")`, que é o único uso no painel. */
  not(coluna: string, operador: string, padrao: string) {
    if (operador !== "like") {
      throw new Error(`O duplo da Supabase não sabe fazer not(${operador}).`);
    }

    this.negacoes.push({ coluna, prefixo: padrao.replace(/%$/, "") });

    return this;
  }

  limit(valor: number) {
    this.limiteLinhas = valor;

    return this;
  }

  select(colunas?: string) {
    this.devolveLinhas = true;
    this.colunas = colunas ?? null;

    return this;
  }

  async maybeSingle(): Promise<Resultado<Linha | null>> {
    const { data, error } = await this.executar();

    if (error) {
      return { data: null, error };
    }

    const linhas = (data as Linha[]) ?? [];

    if (linhas.length > 1) {
      return {
        data: null,
        error: { code: "PGRST116", message: "mais do que uma linha devolvida" },
      };
    }

    return { data: linhas[0] ?? null, error: null };
  }

  then<TResultado1 = Resultado<Linha[] | Linha | null>, TResultado2 = never>(
    aoResolver?:
      | ((valor: Resultado<Linha[] | Linha | null>) => TResultado1 | PromiseLike<TResultado1>)
      | null,
    aoRejeitar?: ((motivo: unknown) => TResultado2 | PromiseLike<TResultado2>) | null,
  ): PromiseLike<TResultado1 | TResultado2> {
    return this.executar().then(aoResolver, aoRejeitar);
  }

  private seleccionar() {
    return this.base.linhasDe(this.tabela).filter((linha) => {
      if (!correspondeAosFiltros(linha, this.filtros)) {
        return false;
      }

      return this.negacoes.every(({ coluna, prefixo }) => {
        const valor = linha[coluna];

        return typeof valor !== "string" || !valor.startsWith(prefixo);
      });
    });
  }

  private async executar(): Promise<Resultado<Linha[] | null>> {
    this.base.registos.push({
      colunas: this.colunas,
      filtros: this.filtros,
      operacao: this.operacao,
      payload: this.payload,
      tabela: this.tabela,
    });

    const falha = this.base.falhas.get(`${this.operacao}:${this.tabela}`);

    if (falha) {
      return { data: null, error: falha };
    }

    const linhas = this.base.linhasDe(this.tabela);

    if (this.operacao === "select") {
      const encontradas = this.seleccionar();

      return {
        data:
          this.limiteLinhas === null
            ? encontradas
            : encontradas.slice(0, this.limiteLinhas),
        error: null,
      };
    }

    if (this.operacao === "insert") {
      const novas = (
        Array.isArray(this.payload) ? this.payload : [this.payload]
      ) as Linha[];

      linhas.push(...novas.map((linha) => ({ ...linha })));

      return { data: this.devolveLinhas ? novas : null, error: null };
    }

    if (this.operacao === "update") {
      const afectadas = this.seleccionar();

      for (const linha of afectadas) {
        Object.assign(linha, this.payload as Linha);
      }

      return { data: this.devolveLinhas ? afectadas : null, error: null };
    }

    if (this.operacao === "delete") {
      const afectadas = this.seleccionar();

      this.base.substituir(
        this.tabela,
        linhas.filter((linha) => !afectadas.includes(linha)),
      );

      return { data: this.devolveLinhas ? afectadas : null, error: null };
    }

    // upsert
    const nova = this.payload as Linha;
    const existente = linhas.find((linha) =>
      this.conflito.every((coluna) => linha[coluna] === nova[coluna]),
    );

    if (existente) {
      Object.assign(existente, nova);
    } else {
      linhas.push({ ...nova });
    }

    return { data: this.devolveLinhas ? [nova] : null, error: null };
  }
}

export class FakeSupabase {
  readonly falhas = new Map<string, { code?: string; message: string }>();
  readonly registos: Registo[] = [];
  private readonly tabelas = new Map<string, Linha[]>();

  constructor(inicial: Record<string, Linha[]> = {}) {
    for (const [tabela, linhas] of Object.entries(inicial)) {
      this.tabelas.set(
        tabela,
        linhas.map((linha) => ({ ...linha })),
      );
    }
  }

  from(tabela: string) {
    return {
      delete: () => new Consulta(this, tabela, "delete"),
      insert: (payload: Linha | Linha[]) =>
        new Consulta(this, tabela, "insert", payload),
      select: (colunas?: string) =>
        new Consulta(this, tabela, "select").select(colunas),
      update: (payload: Linha) => new Consulta(this, tabela, "update", payload),
      upsert: (payload: Linha, opcoes?: { onConflict?: string }) =>
        new Consulta(
          this,
          tabela,
          "upsert",
          payload,
          (opcoes?.onConflict ?? "").split(",").filter(Boolean),
        ),
    };
  }

  linhasDe(tabela: string) {
    const linhas = this.tabelas.get(tabela);

    if (linhas) {
      return linhas;
    }

    const vazia: Linha[] = [];
    this.tabelas.set(tabela, vazia);

    return vazia;
  }

  substituir(tabela: string, linhas: Linha[]) {
    this.tabelas.set(tabela, linhas);
  }

  /** Falha a próxima (e todas as) operações deste tipo nesta tabela. */
  falharEm(operacao: Registo["operacao"], tabela: string, message: string) {
    this.falhas.set(`${operacao}:${tabela}`, { message });
  }
}
