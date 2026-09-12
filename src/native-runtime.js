import { createRequire } from 'node:module';
import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fail, safePath } from './files.js';

const require = createRequire(import.meta.url);

export async function loadNativeRuntime(dependencyRoot) {
  try {
    const root = dependencyRoot ?? path.resolve(path.dirname(require.resolve('@fission-ai/openspec')), '..');
    if (!path.isAbsolute(root)) fail('binding-invalid', 'Native dependency root must be absolute.');
    if ((await lstat(root)).isSymbolicLink()) fail('path-unsafe', 'Native dependency root must not be a symbolic link.');
    const pkg = JSON.parse(await readFile(await safePath(root, 'package.json'), 'utf8'));
    if (pkg.name !== '@fission-ai/openspec' || pkg.version !== '1.12.0') fail('compatibility-error', 'Expected trusted OpenSpec 1.12.0.');
    const modules = await Promise.all([
      'core/parsers/markdown-parser.js', 'core/parsers/change-parser.js', 'core/validation/validator.js',
      'utils/task-progress.js', 'core/parsers/requirement-blocks.js', 'core/validation/task-numbering.js',
      'core/specs-apply.js',
      'core/parsers/requirement-text.js',
      'utils/change-metadata.js', 'core/archive.js',
    ].map(async (file) => import(pathToFileURL(await safePath(root, `dist/${file}`)).href)));
    const runtime = Object.assign({}, ...modules);
    for (const name of ['MarkdownParser', 'ChangeParser', 'Validator', 'parseTaskLines', 'parseDeltaSpec', 'findTaskNumberingIssues', 'findSpecUpdates', 'buildUpdatedSpec', 'buildCodeFenceMask', 'readRetireCapabilitiesMarker', 'readSkipSpecsMarker', 'isRetirableSpec']) {
      if (typeof runtime[name] !== 'function') fail('compatibility-error', `Native function unavailable: ${name}`);
    }
    for (const [name, methods] of Object.entries({
      MarkdownParser: ['parseSpec', 'parseSections'], ChangeParser: ['parseChangeWithDeltas'],
      Validator: ['validateSpecContent', 'validateChange', 'validateChangeDeltaSpecs'],
    })) for (const method of methods) {
      if (typeof runtime[name].prototype[method] !== 'function') fail('compatibility-error', `Native method unavailable: ${name}.${method}`);
    }
    return runtime;
  } catch (error) {
    if (['path-unsafe', 'binding-invalid', 'compatibility-error'].includes(error.code)) throw error;
    fail('compatibility-error', `Trusted native runtime could not be loaded: ${error.message}`);
  }
}
