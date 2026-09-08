import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fail, relativePath, safePath } from './files.js';
import { validateRecord } from './records.js';
import { loadNativeRuntime } from './native-runtime.js';

export async function inspectNativeSnapshot({ repository, revision, openspecRoot, change, files, dependencyRoot } = {}) {
  relativePath(openspecRoot);
  if (change !== undefined) {
    relativePath(change);
    if (change === '.' || change.includes('/')) fail('path-unsafe', 'Change must identify one native change directory.');
  }
  if (!validateRecord('repoRef', { repository, revision, path: openspecRoot }).valid || !Array.isArray(files)) {
    fail('binding-invalid', 'Native inspection requires an explicit fixed snapshot.');
  }
  const prefix = openspecRoot === '.' ? '' : `${openspecRoot}/`;
  const selected = new Map();
  let size = 0;
  for (const file of files) {
    relativePath(file.path);
    if (file.mode === '120000' || file.mode === '160000') fail('path-unsafe', 'Linked snapshot artifacts cannot be inspected.');
    if (!file.path.startsWith(prefix)) continue;
    const relative = file.path.slice(prefix.length);
    const canonical = /^specs\/(?:[^/]+\/)+spec\.md$/.test(relative);
    const changeRelative = change && relative.startsWith(`changes/${change}/`) ? relative.slice(`changes/${change}/`.length) : null;
    const changed = changeRelative && (/^(proposal|design|tasks)\.md$/.test(changeRelative) || /^specs\/(?:[^/]+\/)+spec\.md$/.test(changeRelative));
    if (!canonical && !changed) continue;
    if (!Buffer.isBuffer(file.content) || selected.has(file.path)) fail('binding-invalid', 'Snapshot artifacts require unique paths and raw Buffers.');
    size += file.content.length;
    if (size > 16 * 1024 * 1024 || selected.size >= 1024) fail('snapshot-limit', 'Native snapshot exceeds its bounded input capacity.');
    selected.set(file.path, Buffer.from(file.content));
  }
  const runtime = await loadNativeRuntime(dependencyRoot);
  const validator = new runtime.Validator(true);
  const snapshot = await mkdtemp(path.join(os.tmpdir(), 'assuredloop-native-'));
  const result = { status: 'valid', specs: [], change: null, tasks: [], findings: [], raw_digests: [] };
  const decode = (bytes) => new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  const unavailable = (message) => { result.status = 'unavailable'; result.findings.push({ code: 'native-input-unavailable', message }); };
  try {
    if (selected.size === 0) unavailable('No native artifacts were supplied in the selected snapshot scope.');
    for (const [file, content] of selected) {
      const destination = await safePath(snapshot, file);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, content, { flag: 'wx' });
      result.raw_digests.push({ path: file, sha256: createHash('sha256').update(content).digest('hex') });
      const relative = file.slice(prefix.length);
      if (/^specs\/(?:[^/]+\/)+spec\.md$/.test(relative)) {
        const name = relative.slice('specs/'.length, -'/spec.md'.length);
        const text = decode(content);
        const validation = await validator.validateSpecContent(name, text);
        let model = null;
        try { model = new runtime.MarkdownParser(text).parseSpec(name); } catch { /* Native report retains the format error. */ }
        result.specs.push({ path: file, model, validation });
        if (!validation.valid) result.status = 'invalid';
      }
    }
    if (change) {
      const changePrefix = `${prefix}changes/${change}/`;
      const proposal = selected.get(`${changePrefix}proposal.md`);
      const taskBytes = selected.get(`${changePrefix}tasks.md`);
      if (!proposal) unavailable('The supplied change snapshot has no proposal.md.');
      else {
        const changeDir = await safePath(snapshot, changePrefix.slice(0, -1));
        const validation = await validator.validateChangeDeltaSpecs(changeDir, { mainSpecsDir: path.join(snapshot, prefix, 'specs') });
        const proposalValidation = await validator.validateChange(path.join(changeDir, 'proposal.md'));
        let model = null;
        try { model = await new runtime.ChangeParser(decode(proposal), changeDir).parseChangeWithDeltas(change); }
        catch (error) { result.findings.push({ code: 'native-change-invalid', message: error.message }); result.status = 'invalid'; }
        result.change = { model, validation, proposal_validation: proposalValidation };
        if (!validation.valid || !proposalValidation.valid) result.status = 'invalid';
      }
      if (taskBytes) {
        const content = decode(taskBytes);
        result.tasks = runtime.parseTaskLines(content);
        for (const issue of runtime.findTaskNumberingIssues([{ path: 'tasks.md', content }])) {
          result.findings.push({ code: 'native-task-numbering', ...issue });
          result.status = 'invalid';
        }
      } else unavailable('The supplied standard-layout change has no tasks.md.');
    }
    result.findings.push({ code: 'native-inspection-scope', message: 'Inspected supplied standard spec, delta and task artifacts. Ambient schema discovery, workflow status and semantic completion were not executed.' });
    return result;
  } catch (error) {
    if (['binding-invalid', 'path-unsafe', 'compatibility-error'].includes(error.code)) throw error;
    unavailable(`Native snapshot inspection could not complete: ${error.message}`);
    return result;
  } finally { await rm(snapshot, { recursive: true, force: true }); }
}
