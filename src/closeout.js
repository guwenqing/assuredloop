import { isDeepStrictEqual } from 'node:util';
import { fail } from './files.js';
import { validateRecord } from './records.js';
import { checkSynchronization } from './synchronization.js';
import { checkManifest } from './manifest.js';
import { parseWorkRecord } from './work-records.js';
import { checkTaskAssociations } from './task-associations.js';

const decode = (bytes) => new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);

export async function selectCloseout({ repository, work, record, pull, policy, deltaRef, manifestRef }) {
  const root = policy.config.repository.openspec_root;
  const prefix = root === '.' ? '' : `${root}/`;
  const parsed = await parseWorkRecord({ body: pull.body, kind: 'pr' });
  const pr = parsed.findings.length ? null : parsed.record;
  const change = pr?.change ?? record.change;
  if (!change || (pr?.change && record.change && pr.change !== record.change)) fail('closeout-change-invalid', 'Closeout needs one consistent Issue/PR change selector.');
  const changePath = `${prefix}changes/${change}`;
  const accepted = (record.plan_items || []).filter((ref) => ref.repository.toLowerCase() === repository && ref.path === `${changePath}/tasks.md`);
  const revisions = new Set(accepted.map((ref) => ref.revision));
  if (revisions.size !== 1) fail('closeout-delta-unavailable', 'Closeout change requires exactly one accepted fixed plan revision.');
  if (pr?.change) {
    if (!work || !pr.issues.some((owner) => owner.toLowerCase() === work.toLowerCase()) || !pr.plan_items?.length) fail('closeout-assignment-invalid', 'PR selector needs its actual owning closeout Issue and assigned tasks.');
    for (const ref of pr.plan_items) {
      if (!accepted.some((assigned) => assigned.repository.toLowerCase() === ref.repository.toLowerCase() && assigned.path === ref.path && assigned.revision === ref.revision && ref.items.every((item) => assigned.items.includes(item)))) fail('closeout-assignment-invalid', 'PR task refs must belong to the selected accepted closeout change and revision.');
    }
  }
  const delta = deltaRef || (revisions.size === 1 ? { repository, revision: [...revisions][0], path: changePath } : null);
  if (!validateRecord('repoRef', delta).valid || delta.repository.toLowerCase() !== repository || delta.path !== changePath || !revisions.has(delta.revision)) {
    fail('closeout-delta-unavailable', 'A fixed whole-change delta source must match the selected change and accepted plan revision.');
  }
  const manifest = manifestRef || { repository, revision: pull.head.sha, path: `${changePath}/acceptance-manifest.json` };
  if (!validateRecord('repoRef', manifest).valid || manifest.repository.toLowerCase() !== repository || manifest.revision !== pull.head.sha || !manifest.path.endsWith('/acceptance-manifest.json')) {
    fail('closeout-manifest-unavailable', 'The manifest selector must identify the actual candidate acceptance-manifest.json.');
  }
  return { delta, manifest, openspecRoot: root, change };
}

async function filesAt(adapter, ref, select, optional = false) {
  let inventory;
  try { inventory = await adapter.listFiles(ref); }
  catch (error) {
    if (optional && error.code === 'record-unavailable' && error.details?.reason === 'path-missing') return [];
    throw error;
  }
  const selected = inventory.filter((file) => select(file.path));
  if (selected.length > 1024) fail('snapshot-limit', 'Closeout source inventory exceeds the bounded snapshot capacity.');
  const result = [];
  let bytes = 0;
  for (const file of selected) {
    const content = await adapter.readBlob({ ...ref, path: file.path });
    bytes += content.length;
    if (bytes > 16 * 1024 * 1024) fail('snapshot-limit', 'Closeout source bytes exceed the bounded snapshot capacity.');
    result.push({ path: file.path, mode: file.mode, content });
  }
  return result;
}

export async function evaluateCloseout({ trace, work, record, pull, policy, deltaRef, manifestRef }) {
  const selection = await selectCloseout({ repository: trace.repository, work, record, pull, policy, deltaRef, manifestRef });
  const { delta, manifest, openspecRoot, change } = selection;
  const prefix = openspecRoot === '.' ? '' : `${openspecRoot}/`;
  const baseFiles = await filesAt(trace.adapter, { repository: trace.repository, revision: pull.base.sha, path: '.' }, (file) => file.endsWith('.md'));
  const candidateFiles = await filesAt(trace.adapter, { repository: trace.repository, revision: pull.head.sha, path: '.' }, (file) => file.endsWith('.md'));
  const deltaFiles = await filesAt(trace.adapter, delta, () => true);
  const pr = await parseWorkRecord({ body: pull.body, kind: 'pr' });
  if (pr.record?.change) {
    const tasks = deltaFiles.find((file) => file.path === `${delta.path}/tasks.md`);
    if (!tasks) fail('closeout-assignment-invalid', 'Selected accepted native tasks are unavailable.');
    for (const planRef of pr.record.plan_items) {
      const association = await checkTaskAssociations({ content: decode(tasks.content), planRef, allowedWorks: [work] });
      if (association.findings.some((finding) => finding.severity !== 'review')) fail('closeout-assignment-invalid', 'Selected closeout tasks lack canonical ownership.', association.findings);
    }
  }
  deltaFiles.push(...await filesAt(trace.adapter, { ...delta, path: `${prefix}schemas` }, () => true, true));
  const observedBaseRevision = await trace.adapter.readBranchHead({ repository: trace.repository, branch: pull.base.ref });
  const synchronization = await checkSynchronization({ repository: trace.repository, baseRevision: pull.base.sha,
    headRevision: pull.head.sha, deltaRevision: delta.revision, openspecRoot, change, baseFiles, candidateFiles, deltaFiles, observedBaseRevision });
  const manifestBytes = await trace.adapter.readBlob(manifest);
  const value = JSON.parse(decode(manifestBytes));
  const checkedManifest = await checkManifest({ adapter: trace.adapter, verificationPolicy: policy, manifest: value });
  const inventoryFindings = [];
  if (validateRecord('manifest', value).valid) {
    for (const work of record.depends_on || []) {
      const actual = await trace.adapter.readIssue(work);
      const [repository, number] = work.toLowerCase().split('#');
      if (actual?.number !== Number(number) || actual.repository_url?.toLowerCase() !== `https://api.github.com/repos/${repository}`) fail('work-identity-invalid', 'Manifest prerequisite kind returned a different work identity.');
      const field = actual.pull_request ? 'prs' : 'issues';
      const inventoried = new Set(value.deliveries.flatMap((entry) => (entry[field] || []).map((item) => item.toLowerCase())));
      if (!inventoried.has(work.toLowerCase())) inventoryFindings.push({
      code: 'manifest-inventory-incomplete', message: `${work}: the declared prerequisite has no delivery entry in the selected manifest. This inventory check does not grant delivery or approval credit.`,
      });
    }
  }
  if (!isDeepStrictEqual(value.closeout_policy_ref, policy.policy_ref)) {
    checkedManifest.valid = false;
    checkedManifest.findings.push({ code: 'closeout-manifest-policy-mismatch', message: 'Manifest closeout policy differs from the actual candidate assessment policy.' });
  }
  return { selection, synchronization, manifest: { ...checkedManifest, source: manifest }, inventoryFindings,
    roots: [delta, manifest],
    directory: { ref: delta, content: `Fixed change snapshot: ${delta.path}`, references: deltaFiles.map((file) => ({ ...delta, path: file.path })) } };
}
