import { isDeepStrictEqual } from 'node:util';
import { readSourceRecord } from './source-record.js';
import { reviewVerdictFindings } from './records.js';

// Publication preflight is deliberately local. It checks the complete carrier,
// not remote references, policy, review quality or permission to publish.
export async function preflightRecord({ body, kind, expectedRecord } = {}) {
  if (!['issue', 'pr', 'evidence'].includes(kind)) return { status: 'invalid', record: null,
    findings: [{ code: 'record-kind-invalid', message: 'Choose issue, pr, or evidence.' }] };
  const source = await readSourceRecord(body, { expectedKind: kind });
  const findings = [...source.findings];
  if (source.state === 'valid') {
    if (kind === 'evidence') findings.push(...reviewVerdictFindings(source.record));
    if (expectedRecord !== undefined && !isDeepStrictEqual(source.record, expectedRecord)) findings.push({
      code: 'record-publication-mismatch', message: 'The discovered record differs from the intended --record JSON.' });
  }
  return { status: findings.length ? 'invalid' : 'pass', record: source.record, findings };
}
