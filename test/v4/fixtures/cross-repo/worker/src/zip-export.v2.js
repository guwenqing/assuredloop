// Yearly ZIP export (central:invoice-exports/SP-7, central:invoice-exports/SP-10).
export function zipName(year) {
  return `${year}.zip`;
}

export function monthFiles(year) {
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}.csv`);
}
