// Export links (central:EXP-4, central:EXP-6).
import { randomBytes } from 'node:crypto';
import config from '../config/link.json' with { type: 'json' };

export function issueLink(store, exportId, sentAt) {
  const token = randomBytes(16).toString('hex');
  const expiresAt = sentAt + config.ttlMinutes * 60_000;
  store.set(token, { exportId, expiresAt, used: false });
  return `/exports/download?token=${token}`;
}

export function openLink(store, token, now) {
  const entry = store.get(token);
  if (!entry || entry.used || now >= entry.expiresAt) return null;
  entry.used = true;
  return entry.exportId;
}
