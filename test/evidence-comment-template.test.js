import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { readRecordBody } from '../src/record-body.js';
import { validateRecord } from '../src/records.js';
import { readSourceRecord } from '../src/source-record.js';

function renderEvidenceComment() {
  const template = readFileSync(new URL('../templates/evidence-comment.md', import.meta.url), 'utf8');
  const evidence = JSON.parse(readFileSync(new URL('../templates/records/evidence.json', import.meta.url), 'utf8'));
  const replacements = {
    evidence_subject: 'Synthetic evidence-comment discovery example',
    actual_subject_revision_scope_and_result: 'The shipped illustrative Evidence object is used only as a format fixture.',
    commands_exit_results_or_non_executable_applicability: 'Its command and exit code are synthetic data, not executed review evidence.',
    source_evidence_and_observed_limits: 'Example references are not resolved; this fixture establishes no real acceptance.',
    validated_evidence_context_json: JSON.stringify(evidence, null, 2),
    actual_producer_reviewer_session_model_depth_when_applicable: 'Example session and model declarations do not establish an actual independent review.',
    actual_destination_policy_context_and_unavailable_inputs: 'Example destination, policy, package and digests grant no authorization.',
    unresolved_findings_or_explicit_none: 'No real work or unresolved findings are assessed by this synthetic fixture.',
  };
  const body = template.replace(/\{\{([^{}]+)\}\}/g, (_, name) => {
    assert.ok(Object.hasOwn(replacements, name), `Provide explicit synthetic text for template slot ${name}`);
    return replacements[name];
  });
  assert.doesNotMatch(body, /\{\{|\}\}/, 'the entire shipped template must be fully rendered');
  assert.deepEqual(validateRecord('evidence', evidence), { valid: true, errors: [] },
    'the shipped illustrative Evidence object must be schema-valid before discovery');
  return { body, evidence };
}

test('the fully rendered shipped evidence-comment template is discovered as its original Evidence object', async () => {
  const { body, evidence } = renderEvidenceComment();
  const discovered = await readSourceRecord(body, { allowPlain: true, discoverEvidence: true });

  assert.equal(discovered.state, 'valid', 'a rendered shipped Evidence comment must not disappear into ordinary context');
  assert.equal(discovered.kind, 'evidence');
  assert.deepEqual(discovered.findings, []);
  assert.deepEqual(discovered.record, evidence);
  assert.deepEqual(await readRecordBody(body, { allowPlain: true, withFormat: true }), {
    record: evidence,
    format: 'workflow-context',
  });
});

test('Structured evidence remains an unsupported heading for the same rendered example', async () => {
  const { body } = renderEvidenceComment();
  const unsupported = body.replace(/^## Workflow context$/m, '## Structured evidence');

  await assert.rejects(readRecordBody(unsupported, { allowPlain: true }), { code: 'record-context-missing' });
  assert.deepEqual(await readSourceRecord(unsupported, { allowPlain: true, discoverEvidence: true }), {
    state: 'context',
    record: null,
    kind: null,
    findings: [],
  });
});
