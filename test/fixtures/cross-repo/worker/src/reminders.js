// Reminder job (central:INV-11).
export function dueForReminder(invoice, today) {
  const days = Math.round((today - invoice.dueDate) / 86_400_000);
  return !invoice.paid && days === 7;
}
