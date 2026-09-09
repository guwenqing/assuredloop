import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { execFile, fail, relativePath, safePath } from './files.js';
import { validateRecord } from './records.js';
import { loadNativeRuntime } from './native-runtime.js';
import { checkAnchor } from './policy.js';
import { maskCodeSpans } from './markdown.js';

const decode = (bytes) => new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);

async function retirementMarker(root, changeDir, dependencyRoot) {
  const script = `const { loadNativeRuntime } = await import(process.argv[1]);
    const runtime = await loadNativeRuntime(process.argv[2] || undefined);
    console.log(JSON.stringify(runtime.readRetireCapabilitiesMarker(process.argv[3])));`;
  const { stdout } = await execFile(process.execPath, ['--input-type=module', '-e', script,
    new URL('./native-runtime.js', import.meta.url).href, dependencyRoot || '', changeDir], {
    cwd: root, maxBuffer: 1024 * 1024,
    env: { ...process.env, XDG_DATA_HOME: path.join(root, '.native-data'), XDG_CONFIG_HOME: path.join(root, '.native-config') },
  });
  const marker = JSON.parse(stdout);
  if (typeof marker?.declared !== 'boolean' || (marker.invalidReason !== undefined && typeof marker.invalidReason !== 'string')) fail('compatibility-error', 'Native retirement marker returned an unsupported shape.');
  return marker;
}

function snapshotFiles(files) {
  if (!Array.isArray(files)) fail('binding-invalid', 'Expected an explicit snapshot file inventory.');
  const result = new Map();
  let size = 0;
  for (const file of files) {
    relativePath(file.path);
    if (file.mode === '120000' || file.mode === '160000') fail('path-unsafe', 'Linked snapshot files cannot be synchronized.');
    if (!Buffer.isBuffer(file.content) || result.has(file.path)) fail('binding-invalid', 'Snapshot files require unique paths and raw bytes.');
    size += file.content.length;
    if (size > 16 * 1024 * 1024 || result.size >= 1024) fail('snapshot-limit', 'Synchronization snapshot exceeds its bounded input capacity.');
    result.set(file.path, Buffer.from(file.content));
  }
  return result;
}

export async function checkSynchronization({ repository, baseRevision, headRevision, deltaRevision,
  openspecRoot, change, baseFiles, candidateFiles, deltaFiles, observedBaseRevision, dependencyRoot } = {}) {
  relativePath(openspecRoot);
  relativePath(change);
  if (change === '.' || change.includes('/')) fail('path-unsafe', 'Expected one native change directory.');
  for (const revision of [baseRevision, headRevision, deltaRevision]) {
    if (!validateRecord('repoRef', { repository, revision, path: openspecRoot }).valid) fail('binding-invalid', 'Synchronization requires fixed source revisions.');
  }
  const base = snapshotFiles(baseFiles), candidate = snapshotFiles(candidateFiles), delta = snapshotFiles(deltaFiles);
  const result = { status: 'valid', findings: [], context: { repository, baseRevision, headRevision, deltaRevision, openspecRoot, change, sources: [] } };
  const finding = (code, message, status = 'invalid') => {
    result.findings.push({ code, message });
    if (status === 'invalid' || result.status === 'valid') result.status = status;
  };
  for (const [role, files, revision] of [['base', base, baseRevision], ['candidate', candidate, headRevision], ['delta', delta, deltaRevision]]) {
    for (const [file, bytes] of files) result.context.sources.push({ role, repository, revision, path: file, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  if (observedBaseRevision !== undefined && observedBaseRevision !== baseRevision) finding('synchronization-stale-base', 'The observed destination base differs from the assessed base.');
  if (observedBaseRevision === undefined) result.findings.push({ code: 'snapshot-freshness-unavailable', message: 'Fixed snapshots were assessed; live destination freshness was not observed.' });
  const runtime = await loadNativeRuntime(dependencyRoot);
  const validator = new runtime.Validator(true);
  const root = await mkdtemp(path.join(os.tmpdir(), 'assuredloop-sync-'));
  const prefix = openspecRoot === '.' ? '' : `${openspecRoot}/`;
  const specsPrefix = `${prefix}specs/`;
  const changePrefix = `${prefix}changes/${change}/`;
  const isSpec = (file) => file.startsWith(specsPrefix) && /^(?:[^/]+\/)+spec\.md$/.test(file.slice(specsPrefix.length));
  const expected = new Map([...base].filter(([file]) => isSpec(file)));
  try {
    for (const [files, select] of [[base, isSpec], [delta, (file) => file.startsWith(changePrefix)]]) {
      for (const [file, bytes] of files) if (select(file)) {
        const target = await safePath(root, file);
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, bytes, { flag: 'wx' });
      }
    }
    const changeDir = path.join(root, changePrefix);
    const mainSpecsDir = path.join(root, specsPrefix);
    // The pinned metadata reader resolves schemas under <project>/openspec.
    // Project the explicitly selected native root into an isolated reader view.
    const markerChangeDir = path.join(root, '.native-policy', 'openspec', 'changes', change);
    await mkdir(markerChangeDir, { recursive: true });
    for (const [file, bytes] of delta) {
      let destination;
      if (file === `${changePrefix}.openspec.yaml`) destination = path.join(markerChangeDir, '.openspec.yaml');
      else if (file.startsWith(`${prefix}schemas/`)) destination = await safePath(path.join(root, '.native-policy'), `openspec/${file.slice(prefix.length)}`);
      if (destination) {
        await mkdir(path.dirname(destination), { recursive: true });
        await writeFile(destination, bytes, { flag: 'wx' });
      }
    }
    const updates = await runtime.findSpecUpdates(changeDir, mainSpecsDir);
    if (!updates.length) {
      finding('synchronization-delta-unavailable', 'No native delta artifacts were supplied.', 'unavailable');
      return result;
    }
    else {
      const marker = await retirementMarker(root, markerChangeDir, dependencyRoot);
      if (marker.invalidReason) finding('synchronization-retirement-marker-invalid', marker.invalidReason);
      const report = await validator.validateChangeDeltaSpecs(changeDir, { mainSpecsDir });
      if (!report.valid) finding('synchronization-native-delta-invalid', JSON.stringify(report));
      for (const update of updates) {
        try {
          const built = await runtime.buildUpdatedSpec(update, change, { silent: true });
          const file = `${specsPrefix}${update.id}/spec.md`;
          const retirable = marker.declared && !marker.invalidReason && built.noRequirementBlocks &&
            built.unaccountedContent.length === 0 && await runtime.isRetirableSpec(update.id, built.rebuilt);
          if (retirable && (!update.exists || built.counts.removed > 0)) {
            expected.delete(file);
            if (candidate.has(file)) finding('synchronization-retirement-present', `Native retirement expects the candidate spec absent: ${file}`);
            result.findings.push({ code: update.exists ? 'synchronization-native-retirement' : 'synchronization-native-retirement-skip',
              message: `${file}: ${update.exists ? 'declared retirement matches the native guard' : 'already absent; native reapplication skips this capability'}. This is not proof of authorized delivery.` });
          } else {
            const validation = await validator.validateSpecContent(update.id, built.rebuilt);
            if (!validation.valid) finding('synchronization-native-result-invalid', `${file}: retirement was not established; ${JSON.stringify(validation)}; unaccounted content: ${JSON.stringify(built.unaccountedContent)}`);
            expected.set(file, Buffer.from(built.rebuilt));
          }
        } catch (error) { finding('synchronization-native-build-invalid', error.message); }
      }
    }
    for (const [file, bytes] of candidate) {
      if (!isSpec(file) || expected.has(file)) continue;
      finding('synchronization-unaccounted-candidate', `Canonical candidate Spec is outside the supplied base and native delta outcome: ${file}. Supply its own accepted scope before claiming complete synchronization.`);
      const name = file.slice(specsPrefix.length, -'/spec.md'.length);
      const validation = await validator.validateSpecContent(name, decode(bytes));
      if (!validation.valid) finding('synchronization-native-candidate-invalid', `${file}: ${JSON.stringify(validation)}`);
    }
    for (const [file, bytes] of expected) {
      const actual = candidate.get(file);
      if (!actual) { finding('synchronization-candidate-unavailable', `Missing canonical candidate artifact: ${file}`, 'unavailable'); continue; }
      const name = file.slice(specsPrefix.length, -'/spec.md'.length);
      const validation = await validator.validateSpecContent(name, decode(actual));
      if (!validation.valid) { finding('synchronization-native-candidate-invalid', `${file}: ${JSON.stringify(validation)}`); continue; }
      try {
        const before = new runtime.MarkdownParser(decode(bytes)).parseSpec(name);
        const after = new runtime.MarkdownParser(decode(actual)).parseSpec(name);
        if (JSON.stringify(before.requirements) !== JSON.stringify(after.requirements)) finding('synchronization-delta-coverage', `Native requirement/scenario coverage differs from the full delta result or loses unaffected content: ${file}`);
      } catch (error) { finding('synchronization-native-model-invalid', `${file}: ${error.message}`); }
    }
    for (const [file, bytes] of candidate) {
      if (!file.endsWith('.md')) continue;
      const lines = decode(bytes).split(/\r?\n/);
      const mask = runtime.buildCodeFenceMask(lines);
      const text = maskCodeSpans(lines.map((line, index) => mask[index] ? '' : line).join('\n'));
      const links = [...text.matchAll(/\[[^\]\n]*\]\(([^\s)]*)(?:\s+"[^"]*")?\)/g)].map((match) => match[1]);
      const label = (value) => value.trim().replace(/\s+/g, ' ').toLowerCase();
      const definitions = new Map();
      for (const match of text.matchAll(/^ {0,3}\[([^\]\n]+)\]:\s*(?:<([^>\n]+)>|(\S+))/gm)) {
        if (!definitions.has(label(match[1]))) definitions.set(label(match[1]), match[2] || match[3]);
      }
      const body = text.replace(/^ {0,3}\[[^\]\n]+\]:[^\n]*$/gm, '');
      for (const match of body.matchAll(/\[([^\]\n]+)\](?:\[([^\]\n]*)\])?(?!\()/g)) {
        const href = definitions.get(label(match[2] || match[1]));
        if (href) links.push(href);
      }
      for (const href of links) {
        if (!href || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href)) continue;
        const [targetPath, anchor] = href.split('#');
        if (!anchor) continue;
        let target;
        try {
          target = targetPath ? path.posix.normalize(path.posix.join(path.posix.dirname(file), decodeURIComponent(targetPath))) : file;
          relativePath(target);
          const content = candidate.get(target);
          if (!content) {
            finding('synchronization-inbound-unavailable', `${file}: current link target unavailable: ${target}`, 'unavailable');
            continue;
          }
          await checkAnchor({ anchor: decodeURIComponent(anchor) }, decode(content));
        } catch (error) { finding('synchronization-inbound-anchor', `${file}: ${href}: ${error.message}`); }
      }
    }
    result.findings.push({ code: 'synchronization-review-required', message: 'Native requirement/scenario models and inline/reference-style relative heading links were checked. Semantic equivalence, other Markdown link forms and authorized delivery require independent review.' });
    return result;
  } catch (error) {
    finding('synchronization-native-unavailable', error.message, 'unavailable');
    return result;
  } finally { await rm(root, { recursive: true, force: true }); }
}
