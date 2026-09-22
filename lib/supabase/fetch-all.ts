type SupabasePageResult<T> = {
  data: T[] | null;
  error: unknown;
};

const pageSize = 1000;

export async function fetchAllSupabaseRows<T>(
  loadPage: (from: number, to: number) => PromiseLike<SupabasePageResult<T>>,
) {
  const rows: T[] = [];
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await loadPage(from, to);

    if (error) {
      return { data: rows, error };
    }

    const pageRows = data ?? [];

    rows.push(...pageRows);

    if (pageRows.length < pageSize) {
      return { data: rows, error: null };
    }

    from += pageSize;
  }
}
