import { git } from './files.js';
import { createReadAdapter, workIdentity } from './read-adapter.js';
import { createTrace, currentTracePolicy, closeoutContext, publicBundle, structuredBody, recordReferences } from './trace.js';
import { buildReviewPacket } from './review-packet.js';
import { validateRecord, hasReviewDeclarations } from './records.js';
import { checkWorkRecords, parseWorkRecord } from './work-records.js';
import { resolvePolicy, resolveHistoricalPolicy, checkReviewEvidence, checkEvidenceContext } from './policy.js';
import { isDeepStrictEqual } from 'node:util';

async function liveCheck({ targetRoot, work, deltaRef, manifestRef }) {
  const result = { operation: 'check', mode: 'live', status: 'pass', work, findings: [], policies: [], records: [] };
  const add = (code, message, status = 'invalid', details) => {
    result.findings.push({ code, message, details });
    if (status === 'invalid' || result.status === 'pass') result.status = status;
  };
  try {
    const trace = await createTrace({ targetRoot, work });
    const selected = await trace.bundleAt(work);
    result.repository = trace.repository;
    result.context = publicBundle(selected);
    if (!selected.pulls.length) {
      const policy = await currentTracePolicy(trace);
      result.policy = policy;
      result.policies.push(policy);
      result.context.current = policy.current;
      result.findings.push(...policy.findings);
      if (policy.status !== 'available') add('current-policy-unavailable', 'Required current policy context could not be established.', policy.status === 'invalid' ? 'invalid' : 'unavailable');
      trace.cacheSources(policy.sources || []);
      for (const entry of selected.evidence) {
        if (entry.record.head !== null) {
          try { await trace.adapter.listFiles({ repository: trace.repository, revision: entry.record.head, path: '.' }); }
          catch (error) { add('evidence-source-unavailable', 'The recorded non-PR head is unavailable in the bound repository.', 'unavailable', { head: entry.record.head, cause: error.code, details: error.details }); }
        }
        const declarations = (hasReviewDeclarations(entry.record) ? checkReviewEvidence : checkEvidenceContext)({ record: entry.record, policy, current: { head: entry.record.head } });
        for (const finding of declarations) {
          if (finding.severity === 'review') result.findings.push({ ...finding, context: 'current-policy-comparison' });
          else add(`current-${finding.code}`, `Current policy comparison: ${finding.message}`, finding.code === 'review-policy-unavailable' ? 'unavailable' : 'invalid');
        }
        for (const ref of entry.record.evidence) {
          try { await trace.load(ref); }
          catch (error) { add('evidence-source-unavailable', error.message, 'unavailable', { ref, cause: error.code }); }
        }
      }
      if (selected.evidence.length) result.findings.push({ code: 'non-pr-audit-not-recorded', message: 'Prior policy provenance was not recorded in this non-PR evidence. Current comparison cannot determine past compliance; the original evidence is retained unchanged.' });
    }
    for (const pull of selected.pulls) {
      const pr = `${trace.repository}#${pull.number}`;
      const assessments = selected.evidence.filter((entry) => entry.record.pr?.toLowerCase() === pr);
      if (!assessments.some((entry) => hasReviewDeclarations(entry.record))) add('review-evidence-missing', `${pr} has no structured review assessment evidence.`);
      for (const entry of assessments.length ? assessments : [null]) {
        const historical = pull.merged === true && entry;
        await trace.bindPolicyScope(historical ? { ...pull, base: { ...pull.base, sha: entry.record.base_sha } } : pull);
        const policy = historical
          ? await resolveHistoricalPolicy({ adapter: trace.adapter, record: entry.record })
          : await resolvePolicy({ adapter: trace.adapter, work: pr });
        result.policies.push(policy);
        result.policy ??= policy;
        result.assessment ??= policy.assessment;
        result.findings.push(...policy.findings);
        if (policy.status !== 'available') { add('policy-unavailable', `${pr}: required policy could not be established.`, policy.status === 'invalid' ? 'invalid' : 'unavailable'); continue; }
        trace.cacheSources(policy.sources);
        const current = { ...policy.assessment, policy_ref: policy.policy_ref, contract_package: policy.contract_package,
          config_digest: policy.config_digest, activation_digest: policy.activation_digest };
        if (!historical) {
          const observed = await trace.adapter.readBranchHead({ repository: trace.repository, branch: pull.base.ref });
          if (observed !== policy.assessment.base_sha) add('destination-base-stale', `${pr}: the remote destination branch advanced after the assessed base.`, 'invalid', { assessed: policy.assessment.base_sha, observed });
          if (policy.assessment.head !== pull.head.sha || policy.assessment.base_sha !== pull.base.sha || policy.assessment.base_ref !== pull.base.ref) add('assessment-context-stale', `${pr}: PR identity changed while policy was read.`);
        }
        if (entry) {
          for (const finding of (hasReviewDeclarations(entry.record) ? checkReviewEvidence : checkEvidenceContext)({ record: entry.record, policy, current })) {
            if (finding.severity === 'review') result.findings.push(finding);
            else add(finding.code, finding.message);
          }
          for (const ref of entry.record.evidence) {
            try { await trace.load(ref); }
            catch (error) { add('evidence-source-unavailable', error.message, 'unavailable', { ref, cause: error.code }); }
          }
        }
      }
    }
    const record = await structuredBody(selected.issue.body, { allowPlain: false });
    const issueRefs = selected.issue.pull_request ? (validateRecord('pr', record).valid ? record.issues : []) : [work];
    if (selected.issue.pull_request && !issueRefs.length) add('pr-record-invalid', 'Selected PR has no valid structured Issue mapping.');
    for (const issueRef of issueRefs) {
      const bundle = issueRef === work ? selected : await trace.bundleAt(issueRef);
      if (!selected.pulls.length && !record && bundle.issue.state === 'open') {
        const names = Array.isArray(bundle.issue.labels) ? bundle.issue.labels.map((label) => typeof label === 'string' ? label : label?.name) : [];
        const mapping = result.policy?.config?.repository?.labels?.type || {};
        const routed = ['task', 'bug', 'spike'].some((kind) => typeof mapping[kind] === 'string' && names.includes(mapping[kind]));
        const intake = await parseWorkRecord({ body: bundle.issue.body ?? '', kind: routed ? 'issue' : 'roughRequest', allowMissing: !routed });
        result.records.push({ ...intake, context: { issue: bundle.issue, evidence: bundle.evidence } });
        for (const finding of intake.findings) add(finding.code, finding.message);
        if (routed) add('record-context-required', 'The configured Task/Bug/Spike label requires a routed Workflow context record.');
        else {
          if (result.status === 'pass') result.status = 'incomplete';
          result.findings.push({ code: 'rough-intake-context', message: 'Open rough intake has no routed work record; current policy is inspection context, not task acceptance.' });
        }
        continue;
      }
      const parsed = await parseWorkRecord({ body: bundle.issue.body, kind: 'issue' });
      for (const ref of recordReferences(parsed.record)) {
        try { await trace.load(ref); }
        catch (error) { add('reference-unavailable', error.message, 'unavailable', { ref, cause: error.code }); }
      }
      const checked = await checkWorkRecords({ work: issueRef, ...bundle, phase: parsed.record?.activity === 'closeout' ? 'closeout' : 'handoff', resolveRef: trace.load, resolveWork: trace.bundleAt });
      checked.work = issueRef;
      result.records.push(checked);
      for (const finding of checked.findings) {
        if (finding.severity === 'review') result.findings.push(finding);
        else add(finding.code, finding.message, finding.severity === 'unavailable' ? 'unavailable' : 'invalid', finding.details);
      }
    }
    const closeout = await closeoutContext({ trace, bundle: selected, policies: result.policies, deltaRef, manifestRef });
    if (closeout) {
      result.synchronization = closeout.synchronization;
      result.manifest = closeout.manifest;
      result.context.native = closeout.native;
      for (const finding of closeout.inventoryFindings) add(finding.code, finding.message);
      result.findings.push(...closeout.manifest.findings.filter((finding) => finding.severity === 'review'));
      if (closeout.synchronization.status !== 'valid') add('synchronization-incomplete', 'Native synchronization checks did not establish full coverage.', closeout.synchronization.status === 'invalid' ? 'invalid' : 'unavailable', closeout.synchronization.findings);
      if (!closeout.manifest.valid) add('manifest-invalid', 'Acceptance manifest verification did not pass.', 'invalid', closeout.manifest.findings);
      for (const dependency of closeout.record.depends_on || []) {
        const bundle = await trace.bundleAt(dependency);
        const checked = await checkWorkRecords({ work: dependency, ...bundle, phase: 'closeout', resolveRef: trace.load, resolveWork: trace.bundleAt });
        result.records.push({ work: dependency, ...checked });
        if (checked.status !== 'valid') add('prerequisite-unverified', `${dependency}: prerequisite checks did not pass.`, checked.status === 'invalid' ? 'invalid' : 'unavailable', checked.findings);
        for (const entry of bundle.evidence.filter((item) => item.record.pr)) {
          const pull = bundle.pulls.find((item) => entry.record.pr.toLowerCase() === `${trace.repository}#${item.number}`);
          if (!pull?.merged) continue;
          await trace.bindPolicyScope({ ...pull, base: { ...pull.base, sha: entry.record.base_sha } });
          const policy = await resolveHistoricalPolicy({ adapter: trace.adapter, record: entry.record });
          result.policies.push(policy);
          if (policy.status !== 'available') add('prerequisite-policy-unavailable', `${dependency}: recorded policy could not be reconstructed.`, policy.status === 'invalid' ? 'invalid' : 'unavailable', policy.findings);
          else {
            const current = { ...policy.assessment, policy_ref: policy.policy_ref, contract_package: policy.contract_package,
              config_digest: policy.config_digest, activation_digest: policy.activation_digest };
            for (const finding of (hasReviewDeclarations(entry.record) ? checkReviewEvidence : checkEvidenceContext)({ record: entry.record, policy, current })) {
              if (finding.severity === 'review') result.findings.push({ ...finding, work: dependency });
              else add('prerequisite-review-invalid', `${dependency}: ${finding.message}`, 'invalid', finding);
            }
          }
        }
      }
      await trace.bindPolicyScope(selected.pulls[0]);
      result.packet = await buildReviewPacket({ roots: [...closeout.roots, work], load: trace.load, maxInlineBytes: result.policy.config.project.review.context.max_inline_bytes });
    }
    for (const pull of selected.pulls.filter((item) => !item.merged)) {
      const pr = `${trace.repository}#${pull.number}`;
      const fresh = await trace.adapter.readPull(pr);
      if (!isDeepStrictEqual([pull.head.sha, pull.base.sha, pull.base.ref], [fresh.head?.sha, fresh.base?.sha, fresh.base?.ref])) add('assessment-context-stale', `${pr}: the PR head or destination changed during the check.`);
    }
    for (const finding of await trace.recheckWorkSources()) add(finding.code, finding.message);
    result.findings.push(...trace.findings, { code: 'formal-check-only', message: 'Formal checks do not grant merge permission, authenticate review independence or establish the full assigned outcome.' });
  } catch (error) {
    add(error.code || 'check-unavailable', error.message, 'unavailable', error.details);
  }
  return result;
}

export async function checkWork({ targetRoot, work, localOnly = false, deltaRef, manifestRef } = {}) {
  if (!localOnly) return liveCheck({ targetRoot, work, deltaRef, manifestRef });
  const { repository } = workIdentity(work);
  const adapter = await createReadAdapter({ targetRoot, repository, localOnly });
  const revision = await git(adapter.targetRoot, ['rev-parse', 'HEAD']);
  return {
    operation: 'check', mode: 'local-only', status: 'incomplete', repository, work, revision,
    findings: [
      { code: 'github-skipped', message: 'GitHub records and live destination freshness were not read.' },
      { code: 'policy-unavailable', message: 'A local snapshot does not establish the actual PR destination or its governing policy.' },
    ],
  };
}
