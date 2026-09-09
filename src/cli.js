#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const args = process.argv.slice(2);

try {
  if (!args.length || args[0] === '--help' || args[0] === 'help') {
    console.log(`assuredloop ${pkg.version}\n\ninit --target ABS_ROOT --config ABS_JSON [--apply] [--local-only]\n  Preview explicit local adoption; --apply writes the listed files.\ninspect --target ABS_ROOT --work OWNER/REPO#N\n  [--max-inline-bytes N] [--cursor TOKEN] [--expand REF]\n  [--delta-ref JSON_REPO_REF] [--manifest-ref JSON_REPO_REF]\n  Read a paginated reviewer packet. REF is a qualified work or structured reference JSON.\ncheck --target ABS_ROOT --work OWNER/REPO#N [--local-only]\n  Return a complete non-paginated diagnostic; use inspect for bounded reviewer context. Local-only results are incomplete.\n  Closeout: [--delta-ref JSON_REPO_REF] [--manifest-ref JSON_REPO_REF]\ngenerate-contracts --source-root ABS_ROOT --repository OWNER/REPO --revision FULL_SHA\n  --specs-path REL_PATH --out ABS_DIRECTORY --basis bootstrap|canonical\n--version\n\nInspect/check are read-only. Formal success does not grant merge permission or prove semantic completion. Initialization is not activation.\nNon-PR work uses GitHub's current default branch for current-context inspection only. This adapter convention does not reconstruct past policy or restrict PR delivery destinations.\nReview role remains unresolved in CLI checks; reviewers establish internal/external obligation coverage from the original sources.`);
  } else if (args[0] === '--version') {
    console.log(pkg.version);
  } else if (args[0] === 'inspect') {
    const { values } = parseArgs({ args: args.slice(1), options: {
      target: { type: 'string' }, work: { type: 'string' }, 'max-inline-bytes': { type: 'string' },
      cursor: { type: 'string' }, expand: { type: 'string', multiple: true },
      'delta-ref': { type: 'string' }, 'manifest-ref': { type: 'string' },
    } });
    const { inspectWork } = await import('./trace.js');
    const result = await inspectWork({ targetRoot: values.target, work: values.work,
      maxInlineBytes: values['max-inline-bytes'] === undefined ? undefined : Number(values['max-inline-bytes']),
      cursor: values.cursor, expand: (values.expand || []).map((ref) => ref.startsWith('{') ? JSON.parse(ref) : ref),
      deltaRef: values['delta-ref'] ? JSON.parse(values['delta-ref']) : undefined,
      manifestRef: values['manifest-ref'] ? JSON.parse(values['manifest-ref']) : undefined });
    console.log(JSON.stringify(result));
    if (result.status !== 'pass') process.exitCode = 1;
  } else if (args[0] === 'check') {
    const { values } = parseArgs({ args: args.slice(1), options: {
      target: { type: 'string' }, work: { type: 'string' }, 'local-only': { type: 'boolean', default: false },
      'delta-ref': { type: 'string' }, 'manifest-ref': { type: 'string' },
    } });
    const { checkWork } = await import('./check.js');
    const result = await checkWork({ targetRoot: values.target, work: values.work, localOnly: values['local-only'],
      deltaRef: values['delta-ref'] ? JSON.parse(values['delta-ref']) : undefined,
      manifestRef: values['manifest-ref'] ? JSON.parse(values['manifest-ref']) : undefined });
    console.log(JSON.stringify(result, null, 2));
    if (result.status !== 'pass') process.exitCode = 1;
  } else if (args[0] === 'init') {
    const { values } = parseArgs({ args: args.slice(1), options: {
      target: { type: 'string' }, config: { type: 'string' }, apply: { type: 'boolean', default: false },
      'local-only': { type: 'boolean', default: false },
    } });
    if (!values.target || !values.config) throw Object.assign(new Error('init requires --target and --config.'), { code: 'binding-invalid' });
    const { planInitialization, applyInitialization } = await import('./adoption.js');
    const config = JSON.parse(await readFile(values.config, 'utf8'));
    const plan = await planInitialization({ targetRoot: values.target, config, localOnly: values['local-only'] });
    console.log(JSON.stringify(values.apply ? await applyInitialization(plan) : plan, null, 2));
  } else if (args[0] === 'generate-contracts') {
    const { values } = parseArgs({ args: args.slice(1), options: Object.fromEntries(
      ['source-root', 'repository', 'revision', 'specs-path', 'out', 'basis'].map((key) => [key, { type: 'string' }])) });
    const { generateContracts } = await import('./contracts.js');
    const metadata = await generateContracts({ sourceRoot: values['source-root'],
      sourceRef: { repository: values.repository, revision: values.revision, path: values['specs-path'] },
      outputRoot: values.out, packageName: pkg.name, packageVersion: pkg.version, basis: values.basis });
    console.log(JSON.stringify(metadata, null, 2));
  } else {
    throw Object.assign(new Error(`Unknown command: ${args[0]}`), { code: 'command-unavailable' });
  }
} catch (error) {
  console.log(JSON.stringify({ status: 'error', code: error.code || 'operation-failed', message: error.message, details: error.details }));
  process.exitCode = 1;
}
