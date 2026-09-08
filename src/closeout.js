import { isDeepStrictEqual } from 'node:util';
import { fail } from './files.js';
import { validateRecord } from './records.js';
import { checkSynchronization } from './synchronization.js';
import { checkManifest } from './manifest.js';

const decode = (bytes) => new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);

export function selectCloseout({ repository, record, pull, policy, deltaRef, manifestRef }) {
  const root = policy.config.repository.openspec_root;
  const prefix = root === '.' ? '' : `${root}/`;
  const changePath = `${prefix}changes/${record.change}`;
  const accepted = (record.plan_items || []).filter((ref) => ref.repository.toLowerCase() === repository && ref.path === `${changePath}/tasks.md`);
  const revisions = new Set(accepted.map((ref) => ref.revision));
  const delta = deltaRef || (revisions.size === 1 ? { repository, revision: [...revisions][0], path: changePath } : null);
  if (!validateRecord('repoRef', delta).valid || delta.repository.toLowerCase() !== repository || delta.path !== changePath || !revisions.has(delta.revision)) {
    fail('closeout-delta-unavailable', 'A fixed whole-change delta source must match the selected change and accepted plan revision.');
  }
  const manifest = manifestRef || { repository, revision: pull.head.sha, path: `${changePath}/acceptance-manifest.json` };
  if (!validateRecord('repoRef', manifest).valid || manifest.repository.toLowerCase() !== repository || manifest.revision !== pull.head.sha || !manifest.path.endsWith('/acceptance-manifest.json')) {
    fail('closeout-manifest-unavailable', 'The manifest selector must identify the actual candidate acceptance-manifest.json.');
  }
  return { delta, manifest, openspecRoot: root, change: record.change };
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

export async function evaluateCloseout({ trace, record, pull, policy, deltaRef, manifestRef }) {
  const selection = selectCloseout({ repository: trace.repository, record, pull, policy, deltaRef, manifestRef });
  const { delta, manifest, openspecRoot, change } = selection;
  const prefix = openspecRoot === '.' ? '' : `${openspecRoot}/`;
  const baseFiles = await filesAt(trace.adapter, { repository: trace.repository, revision: pull.base.sha, path: '.' }, (file) => file.endsWith('.md'));
  const candidateFiles = await filesAt(trace.adapter, { repository: trace.repository, revision: pull.head.sha, path: '.' }, (file) => file.endsWith('.md'));
  const deltaFiles = await filesAt(trace.adapter, delta, () => true);
  deltaFiles.push(...await filesAt(trace.adapter, { ...delta, path: `${prefix}schemas` }, () => true, true));
  const observedBaseRevision = await trace.adapter.readBranchHead({ repository: trace.repository, branch: pull.base.ref });
  const synchronization = await checkSynchronization({ repository: trace.repository, baseRevision: pull.base.sha,
    headRevision: pull.head.sha, deltaRevision: delta.revision, openspecRoot, change, baseFiles, candidateFiles, deltaFiles, observedBaseRevision });
  const manifestBytes = await trace.adapter.readBlob(manifest);
  const value = JSON.parse(decode(manifestBytes));
  const checkedManifest = await checkManifest({ adapter: trace.adapter, manifest: value });
  const inventoryFindings = [];
  if (validateRecord('manifest', value).valid) {
    const inventoried = new Set(value.deliveries.flatMap((entry) => entry.issues.map((work) => work.toLowerCase())));
    for (const work of record.depends_on || []) if (!inventoried.has(work.toLowerCase())) inventoryFindings.push({
      code: 'manifest-inventory-incomplete', message: `${work}: the declared prerequisite has no delivery entry in the selected manifest. This inventory check does not grant delivery or approval credit.`,
    });
  }
  if (!isDeepStrictEqual(value.closeout_policy_ref, policy.policy_ref)) {
    checkedManifest.valid = false;
    checkedManifest.findings.push({ code: 'closeout-manifest-policy-mismatch', message: 'Manifest closeout policy differs from the actual candidate assessment policy.' });
  }
  return { selection, synchronization, manifest: { ...checkedManifest, source: manifest }, inventoryFindings,
    roots: [delta, manifest],
    directory: { ref: delta, content: `Fixed change snapshot: ${delta.path}`, references: deltaFiles.map((file) => ({ ...delta, path: file.path })) } };
}
