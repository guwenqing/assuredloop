export function formatCalendarDate(value) {
  return new Date(value).toISOString().slice(0, 10);
}

export function exportCalendarCsv(events) {
  const rows = events.map((event) => `${formatCalendarDate(event.date)},${event.title}`);
  return ['date,title', ...rows].join('\n');
}
