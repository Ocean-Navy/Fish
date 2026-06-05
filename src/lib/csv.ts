const csvFormulaPattern = /^[\t\r\n ]*[=+\-@]/;

export function csvCell(value: string | number | boolean | null | undefined) {
  const text = neutralizeCsvFormula(String(value ?? ""));
  return `"${text.replaceAll('"', '""')}"`;
}

export function toCsv(headers: string[], rows: Array<Array<string | number | boolean | null | undefined>>) {
  return [headers, ...rows].map((line) => line.map(csvCell).join(",")).join("\n");
}

function neutralizeCsvFormula(value: string) {
  if (!csvFormulaPattern.test(value)) {
    return value;
  }

  return `'${value}`;
}
