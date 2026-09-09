export function formatCalendarDate(value, locale = 'en-CA') {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'UTC'
  }).format(new Date(value));
}

export function exportCalendarCsv(events, locale = 'en-CA') {
  const rows = events.map((event) => `${formatCalendarDate(event.date, locale)},${event.title}`);
  return ['date,title', ...rows].join('\n');
}
