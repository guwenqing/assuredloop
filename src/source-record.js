import { readRecordBody } from './record-body.js';
import { hasReviewDeclarations, validateRecord } from './records.js';

const assessmentFields = ['head', 'no_head_reason', 'command', 'exit_code', 'pr', 'base_ref', 'base_sha',
  'policy_ref', 'policy_mode', 'contract_package', 'config_digest', 'activation_digest'];

function evidenceCandidate(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return hasReviewDeclarations(value) || assessmentFields.some((field) => Object.hasOwn(value, field)) ||
    (Object.hasOwn(value, 'scope') && (Object.hasOwn(value, 'result') || Object.hasOwn(value, 'evidence')));
}

// Discovery is limited to comment envelopes. Generic supporting artifacts do not
// acquire a canonical record role merely because they contain a familiar key.
export async function readSourceRecord(body, { allowPlain = false, discoverEvidence = false, expectedKind, allowMissing = false } = {}) {
  let parsed;
  try {
    if (body == null && allowMissing) return { state: 'context', record: null, kind: null, findings: [] };
    parsed = await readRecordBody(body, { allowPlain, withFormat: true });
  } catch (error) {
    if (error.code === 'record-context-missing' && (!expectedKind || allowMissing)) return { state: 'context', record: null, kind: null, findings: [] };
    if (!['record-context-missing', 'record-context-invalid'].includes(error.code)) throw error;
    return { state: 'invalid', record: null, kind: expectedKind ?? null,
      findings: [{ code: error.code, severity: 'error', message: error.message }] };
  }
  const { record, format } = parsed;
  const kind = expectedKind ?? (record?.record_type === 'self-change-decision' ? 'selfChangeDecision'
    : format === 'workflow-context' || (discoverEvidence && evidenceCandidate(record)) ? 'evidence' : null);
  if (!kind) return { state: 'context', record: null, kind: null, findings: [] };
  const shape = validateRecord(kind, record);
  const code = kind === 'evidence' ? hasReviewDeclarations(record) ? 'review-evidence-invalid' : 'evidence-record-invalid' : 'record-schema-invalid';
  return { state: shape.valid ? 'valid' : 'invalid', record, kind,
    findings: shape.valid ? [] : [{ code, severity: 'error', message: `Source does not satisfy the ${kind} record schema.`, details: shape.errors }] };
}
