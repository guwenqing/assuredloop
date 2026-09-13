#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { resolveRuntime, runtimeContext } from './runtime.js';

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const args = process.argv.slice(2);
let runtime;

try {
  if (['init', 'inspect', 'check'].includes(args[0])) runtime = await resolveRuntime({
    invokedPath: process.argv[1], modulePath: fileURLToPath(import.meta.url),
  });
  if (!args.length || args[0] === '--help' || args[0] === 'help') {
    console.log(`assuredloop ${pkg.version}\n\nvalidate --kind issue|pr|evidence --file MARKDOWN [--record INTENDED_JSON]\n  Local carrier/schema preflight; no setup, credentials, network or publication.\ninit --target ABS_ROOT --config ABS_JSON [--apply] [--local-only | --provision-labels]\n  Preview explicit adoption; --apply writes the listed files.\n  --provision-labels previews missing mapped labels; add --apply to create only those still missing.\n  Partial effects return exit 1; read outcomes and retry from a new preview.\ninspect --target ABS_ROOT --work OWNER/REPO#N\n  [--max-inline-bytes N] [--cursor TOKEN] [--expand REF]\n  [--delta-ref JSON_REPO_REF] [--manifest-ref JSON_REPO_REF]\n  Read a paginated reviewer packet. REF is a qualified work or structured reference JSON.\ncheck --target ABS_ROOT --work OWNER/REPO#N [--local-only]\n  Return a complete non-paginated diagnostic; use inspect for bounded reviewer context. Local-only results are incomplete.\n  Closeout: [--delta-ref JSON_REPO_REF] [--manifest-ref JSON_REPO_REF]\ngenerate-contracts --source-root ABS_ROOT --repository OWNER/REPO --revision FULL_SHA\n  --specs-path REL_PATH --out ABS_DIRECTORY --basis bootstrap|canonical\n--version\n\nInspect/check are read-only. Formal success does not grant merge permission or prove semantic completion. Initialization is not activation.\nNon-PR work uses GitHub's current default branch for current-context inspection only. This adapter convention does not reconstruct past policy or restrict PR delivery destinations.\nActual npm package-root links select linked-development with toolkit_verification: not-performed. Consumer policy/source/review checks remain required; ordinary bin shims and direct source keep existing checks.\nOptional existing review constraints are checked only when configured. New setup does not prescribe models, depth, providers or work methods; inspect/check never launch reviews.`);
  } else if (args[0] === '--version') {
    console.log(pkg.version);
  } else if (args[0] === 'validate') {
    const { values } = parseArgs({ args: args.slice(1), options: {
      kind: { type: 'string' }, file: { type: 'string' }, record: { type: 'string' },
    } });
    if (!values.kind || !values.file) throw Object.assign(new Error('validate requires --kind issue|pr|evidence and --file MARKDOWN.'), { code: 'binding-invalid' });
    const { preflightRecord } = await import('./record-preflight.js');
    const result = await preflightRecord({ body: await readFile(values.file, 'utf8'), kind: values.kind,
      expectedRecord: values.record ? JSON.parse(await readFile(values.record, 'utf8')) : undefined });
    console.log(JSON.stringify(result, null, 2));
    if (result.status !== 'pass') process.exitCode = 1;
  } else if (args[0] === 'inspect') {
    const { values } = parseArgs({ args: args.slice(1), options: {
      target: { type: 'string' }, work: { type: 'string' }, 'max-inline-bytes': { type: 'string' },
      cursor: { type: 'string' }, expand: { type: 'string', multiple: true },
      'delta-ref': { type: 'string' }, 'manifest-ref': { type: 'string' },
    } });
    const { inspectWork } = await import('./trace.js');
    const result = await inspectWork({ targetRoot: values.target, work: values.work, runtime,
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
    const result = await checkWork({ targetRoot: values.target, work: values.work, runtime, localOnly: values['local-only'],
      deltaRef: values['delta-ref'] ? JSON.parse(values['delta-ref']) : undefined,
      manifestRef: values['manifest-ref'] ? JSON.parse(values['manifest-ref']) : undefined });
    console.log(JSON.stringify(result, null, 2));
    if (result.status !== 'pass') process.exitCode = 1;
  } else if (args[0] === 'init') {
    const { values } = parseArgs({ args: args.slice(1), options: {
      target: { type: 'string' }, config: { type: 'string' }, apply: { type: 'boolean', default: false },
      'local-only': { type: 'boolean', default: false },
      'provision-labels': { type: 'boolean', default: false },
    } });
    if (!values.target || !values.config) throw Object.assign(new Error('init requires --target and --config.'), { code: 'binding-invalid' });
    const { planInitialization, applyInitialization } = await import('./adoption.js');
    const config = JSON.parse(await readFile(values.config, 'utf8'));
    const plan = await planInitialization({ targetRoot: values.target, config, localOnly: values['local-only'], provisionLabels: values['provision-labels'], runtime });
    const result = values.apply ? await applyInitialization(plan) : plan;
    console.log(JSON.stringify(result, null, 2));
    if (result.status === 'partial') process.exitCode = 1;
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
  console.log(JSON.stringify({ ...runtimeContext(runtime), status: 'error', code: error.code || 'operation-failed', message: error.message, details: error.details }));
  process.exitCode = 1;
}
