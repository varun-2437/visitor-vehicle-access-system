/**
 * Export array of objects to downloadable CSV file.
 * @param {string} filename Name of the downloaded file (e.g. 'visitor_logs.csv')
 * @param {Array} rows Array of data objects
 * @param {Array} columns Array of { label: string, accessor: string|function }
 */
export function exportToCSV(filename, rows, columns) {
  if (!rows || !rows.length) {
    alert("No data available to export.");
    return;
  }

  const header = columns.map((c) => `"${c.label.replace(/"/g, '""')}"`).join(",");
  const body = rows
    .map((row) =>
      columns
        .map((c) => {
          let val = typeof c.accessor === "function" ? c.accessor(row) : row[c.accessor];
          if (val === null || val === undefined) val = "";
          const str = String(val).replace(/"/g, '""');
          return `"${str}"`;
        })
        .join(",")
    )
    .join("\n");

  const blob = new Blob(["\uFEFF" + header + "\n" + body], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
