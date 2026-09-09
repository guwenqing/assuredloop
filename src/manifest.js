import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { fail } from './files.js';
import { validateRecord } from './records.js';
import { readRecordBody } from './record-body.js';

const auditFields = ['base_ref', 'base_sha', 'policy_ref', 'policy_mode'];
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const decode = (bytes) => new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);

async function sourceRecord(bytes) {
  let content, invalidEncoding = false;
  try { content = decode(bytes); }
  catch { invalidEncoding = true; content = bytes.toString('utf8'); }
  try {
    const record = await readRecordBody(content, { allowPlain: true });
    if (invalidEncoding) fail('source-record-invalid', 'Structured source has invalid UTF-8 encoding.');
    return { record, manual: false };
  }
  catch (error) {
    if (!['record-context-missing', 'record-context-invalid', 'source-record-invalid'].includes(error.code)) throw error;
    if (error.code === 'record-context-missing' && !/^\s*[\[{]/.test(content)) return { record: null, manual: true };
    fail('source-record-invalid', `Malformed or ambiguous structured source${invalidEncoding ? ' with invalid UTF-8 encoding' : ''}: ${error.message}`);
  }
}

const manualReview = (source) => ({ code: 'source-summary-review-required', severity: 'review', source,
  message: 'The caller-authored summary needs semantic comparison with the original historical report. Matching source bytes do not prove summary accuracy, approval or delivered coverage.' });

function manualRow(entry, bytes) {
  const row = { ...structuredClone(entry), content_sha256: hash(bytes) };
  for (const field of auditFields) if (row[field] === undefined) row[field] = null;
  if (row.reviewed_head === null && row.prs?.length) fail('source-summary-invalid', 'A code/PR assessment cannot use a null reviewed head to hide an unknown revision.');
  const shape = validateRecord('delivery', row);
  if (!shape.valid) fail('source-summary-invalid', 'An unstructured historical source needs an explicit complete delivery summary; required fields cannot be invented.', shape.errors);
  return row;
}

async function sourceBytes(adapter, source) {
  const shape = validateRecord('source', source);
  if (!shape.valid) fail('source-invalid', 'Invalid fixity source descriptor.', shape.errors);
  if (source.kind === 'git-blob') {
    const bytes = await adapter.readBlob(source.ref);
    if (!Buffer.isBuffer(bytes)) fail('evidence-unavailable', 'Raw Git blob bytes are unavailable.');
    return bytes;
  }
  const value = await adapter.readComment({ repository: source.repository, comment_id: source.comment_id });
  if (value?.id !== source.comment_id || typeof value?.body !== 'string') fail('evidence-unavailable', 'The declared comment identity/body representation is unavailable.');
  return Buffer.from(value.body, 'utf8');
}

function summary(record, entry) {
  if (!record || typeof record !== 'object' || record.record_type !== undefined) fail('source-record-invalid', 'Delivery source must contain an Evidence record, not a decision or unstructured summary.');
  const row = { issues: structuredClone(entry.issues), reviewed_head: record.head, result: record.result, scope: record.scope,
    base_ref: record.base_ref ?? null, base_sha: record.base_sha ?? null,
    policy_ref: record.policy_ref ?? null, policy_mode: record.policy_mode ?? null,
    source: structuredClone(entry.source), content_sha256: entry.content_sha256 };
  if (entry.prs !== undefined) row.prs = structuredClone(entry.prs);
  else if (record.pr !== undefined) row.prs = [record.pr];
  if (record.no_head_reason !== undefined) row.no_head_reason = record.no_head_reason;
  return row;
}

function auditFindings(record, source) {
  return record.head !== null && auditFields.some((field) => record[field] == null)
    ? [{ code: 'audit-data-unavailable', message: 'Historical audit fields are missing or inapplicable; null values preserve the gap without reconstructing current policy.', source }]
    : [];
}

export async function captureManifest({ adapter, closeoutPolicyRef, capturedAt, deliveries = [], decisions = [] } = {}) {
  const manifest = { schema_version: 1, captured_at: capturedAt, closeout_policy_ref: structuredClone(closeoutPolicyRef), deliveries: [], decisions: [] };
  if (!Array.isArray(deliveries) || !Array.isArray(decisions) || !validateRecord('manifest', manifest).valid) {
    fail('manifest-invalid', 'Manifest capture requires valid explicit closeout context and source lists.');
  }
  const findings = [];
  for (const [kind, entries] of [['delivery', deliveries], ['decision', decisions]]) {
    for (const entry of entries) {
      try {
        const bytes = await sourceBytes(adapter, entry.source);
        const { record, manual } = await sourceRecord(bytes);
        if (kind === 'decision') {
          const shape = validateRecord('selfChangeDecision', record);
          if (!shape.valid) fail('source-record-invalid', 'Source is not a valid typed self-change decision.', shape.errors);
          manifest.decisions.push({ ...structuredClone(record), source: structuredClone(entry.source), content_sha256: hash(bytes) });
        } else {
          if (manual) {
            const row = manualRow(entry, bytes);
            manifest.deliveries.push(row);
            findings.push(manualReview(entry.source), ...auditFindings({ ...row, head: row.reviewed_head }, entry.source));
            continue;
          }
          const evidenceShape = validateRecord('evidence', record);
          if (!evidenceShape.valid) fail('source-evidence-invalid', 'A malformed structured Evidence record cannot use the historical-prose path.', evidenceShape.errors);
          const row = summary(record, { ...entry, content_sha256: hash(bytes) });
          const shape = validateRecord('delivery', row);
          if (!shape.valid) fail('source-record-invalid', 'Delivery source has insufficient or invalid summary fields.', shape.errors);
          for (const field of ['reviewed_head', 'scope', 'result', 'no_head_reason', ...auditFields]) {
            if (Object.hasOwn(entry, field) && !isDeepStrictEqual(entry[field], row[field])) findings.push({ code: 'source-summary-mismatch', message: `Caller-supplied ${field} contradicts the structured source; its original value is retained.`, source: entry.source });
          }
          if (record.pr && entry.prs && !entry.prs.includes(record.pr)) findings.push({ code: 'source-summary-mismatch', message: 'Supplied delivery PRs contradict the source assessment PR.', source: entry.source });
          findings.push(...auditFindings(record, entry.source));
          manifest.deliveries.push(row);
        }
      } catch (error) {
        findings.push({ code: error.code || 'source-record-unavailable', message: error.message, source: entry.source, details: error.details });
      }
    }
  }
  return { manifest, findings };
}

export async function checkManifest({ adapter, manifest } = {}) {
  const findings = [];
  const shape = validateRecord('manifest', manifest);
  if (!shape.valid) return { valid: false, findings: [{ code: 'manifest-source-invalid', message: 'Manifest or source descriptor is invalid.', details: shape.errors }] };
  for (const [kind, entries] of [['delivery', manifest.deliveries], ['decision', manifest.decisions]]) {
    for (const entry of entries) {
      try {
        const bytes = await sourceBytes(adapter, entry.source);
        if (hash(bytes) !== entry.content_sha256) {
          findings.push({ code: 'evidence-drift', message: 'Source bytes differ from the captured digest.', source: entry.source });
          continue;
        }
        const { record, manual } = await sourceRecord(bytes);
        if (manual && kind === 'delivery') {
          manualRow(entry, bytes);
          findings.push(manualReview(entry.source), ...auditFindings({ ...entry, head: entry.reviewed_head }, entry.source));
          continue;
        }
        if (kind === 'decision') {
          if (!validateRecord('selfChangeDecision', record).valid) fail('source-record-invalid', 'Decision source has invalid or mixed fields.');
          const { source, content_sha256, ...stored } = entry;
          if (!isDeepStrictEqual(stored, record)) findings.push({ code: 'source-summary-mismatch', message: 'Stored decision differs from its source.', source });
        } else {
          const expected = summary(record, entry);
          if (!isDeepStrictEqual(expected, entry) || (record.pr && entry.prs && !entry.prs.includes(record.pr))) {
            findings.push({ code: 'source-summary-mismatch', message: 'Stored delivery summary/audit fields differ from the source assessment.', source: entry.source });
          }
          if (!validateRecord('evidence', record).valid) findings.push({ code: 'source-evidence-invalid', message: 'Source evidence shape is invalid.', source: entry.source });
          findings.push(...auditFindings(record, entry.source));
        }
      } catch (error) {
        findings.push({ code: 'evidence-unavailable', message: error.message, source: entry.source, cause: error.code });
      }
    }
  }
  return { valid: findings.every((finding) => finding.severity === 'review'), findings };
}
