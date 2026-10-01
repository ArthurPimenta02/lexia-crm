type SupabasePageResult<T> = {
  data: T[] | null;
  error: unknown;
};

const pageSize = 1000;
const concurrentPageCount = 4;

export async function fetchAllSupabaseRows<T>(
  loadPage: (from: number, to: number) => PromiseLike<SupabasePageResult<T>>,
) {
  const rows: T[] = [];
  const firstPage = await loadPage(0, pageSize - 1);

  if (firstPage.error) {
    return { data: rows, error: firstPage.error };
  }

  const firstPageRows = firstPage.data ?? [];

  rows.push(...firstPageRows);

  if (firstPageRows.length < pageSize) {
    return { data: rows, error: null };
  }

  let batchStart = pageSize;

  while (true) {
    const pages = await Promise.all(
      Array.from({ length: concurrentPageCount }, (_, pageIndex) => {
        const from = batchStart + pageIndex * pageSize;

        return loadPage(from, from + pageSize - 1);
      }),
    );

    for (const { data, error } of pages) {
      if (error) {
        return { data: rows, error };
      }

      const pageRows = data ?? [];

      rows.push(...pageRows);

      if (pageRows.length < pageSize) {
        return { data: rows, error: null };
      }
    }

    batchStart += concurrentPageCount * pageSize;
  }
}
