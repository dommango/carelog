export type ChartTableColumn<Row> = {
  key: string;
  label: string;
  value: (row: Row) => string;
};

export default function ChartDataTable<Row>({
  label,
  caption,
  columns,
  rows,
  rowKey,
}: {
  label: string;
  caption: string;
  columns: ReadonlyArray<ChartTableColumn<Row>>;
  rows: readonly Row[];
  rowKey: (row: Row) => string;
}) {
  if (rows.length === 0) return null;

  const [first, ...rest] = columns;

  return (
    <details className="mt-3">
      <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-bold text-accent-deep">
        {label}
      </summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-left text-sm text-ink">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-line">
              {columns.map((column) => (
                <th key={column.key} scope="col" className="py-2 pr-3 font-bold text-ink-soft">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)} className="border-b border-line last:border-0">
                <th scope="row" className="py-2 pr-3 font-normal">
                  {first.value(row)}
                </th>
                {rest.map((column) => (
                  <td key={column.key} className="py-2 pr-3 tabular-nums">
                    {column.value(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
