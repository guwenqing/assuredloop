#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const args = process.argv.slice(2);

try {
  if (!args.length || args[0] === '--help' || args[0] === 'help') {
    console.log(`assuredloop ${pkg.version}\n\ninit --target ABS_ROOT --config ABS_JSON [--apply] [--local-only]\n  Preview explicit local adoption; --apply writes the listed files.\ngenerate-contracts --source-root ABS_ROOT --repository OWNER/REPO --revision FULL_SHA\n  --specs-path REL_PATH --out ABS_DIRECTORY --basis bootstrap|canonical\n--version\n\nInitialization is not activation. inspect/check are delivered separately.`);
  } else if (args[0] === '--version') {
    console.log(pkg.version);
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
