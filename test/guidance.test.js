import assert from 'node:assert/strict';
import { readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

import { applyInitialization, planInitialization } from '../src/adoption.js';
import { validateRecord } from '../src/records.js';
import {
  makeGitFixture,
  makeConfig,
  readJson,
} from './fixtures/adoption/helpers.js';

const repositoryRoot = path.resolve(new URL('..', import.meta.url).pathname);
const skillsRoot = path.join(repositoryRoot, 'skills');
const templatesRoot = path.join(repositoryRoot, 'templates');
const operations = ['adopt', 'record', 'context', 'sync'];

const templateKinds = new Map([
  ['activation.json', 'activation'],
  ['config.json', 'config'],
  ['evidence.json', 'evidence'],
  ['initialBootstrapVerification.json', 'initialBootstrapVerification'],
  ['issue.json', 'issue'],
  ['manifest.json', 'manifest'],
  ['planRef.json', 'planRef'],
  ['pr.json', 'pr'],
  ['repoRef.json', 'repoRef'],
  ['selfChangeDecision.json', 'selfChangeDecision'],
]);

const forbiddenReusableIdentity = [
  /\bguwenqing\/assuredloop-base\b/i,
  /github\.com\/guwenqing\b/i,
  /5576464303/,
  /codex\/issue-7-work-guidance/i,
];

const authoritativeReference = /(?:schemas\/workflow\.schema\.json|templates\/records|contracts\/|project-workflow-adoption\/spec\.md|work-intake-and-planning\/spec\.md|review-and-validation\/spec\.md|specification-baseline\/spec\.md)/i;
const installBindings = new Set(['repository', 'openspec_root', 'package_name', 'package_version']);

async function filesUnder(root, predicate = () => true, relative = '') {
  const entries = await readdir(path.join(root, relative), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await filesUnder(root, predicate, child));
    else if (predicate(child)) files.push(child);
  }
  return files.sort();
}

function parseFrontmatter(source, file) {
  const lines = source.split(/\r?\n/);
  assert.equal(lines[0], '---', `${file} must start with simple frontmatter`);
  const closing = lines.indexOf('---', 1);
  assert.ok(closing > 1, `${file} must close its frontmatter`);
  const fields = {};
  for (const line of lines.slice(1, closing)) {
    assert.match(line, /^[a-z][a-z0-9_-]*:\s+\S(?:.*)?$/, `${file} has non-simple frontmatter: ${line}`);
    const separator = line.indexOf(':');
    const key = line.slice(0, separator);
    assert.equal(fields[key], undefined, `${file} repeats frontmatter key ${key}`);
    fields[key] = line.slice(separator + 1).trim();
    assert.doesNotMatch(fields[key], /[\r\n]/, `${file} frontmatter values must be scalar`);
  }
  assert.equal(typeof fields.name, 'string', `${file} frontmatter needs name`);
  assert.equal(typeof fields.description, 'string', `${file} frontmatter needs description`);
  return { fields, body: lines.slice(closing + 1).join('\n') };
}

function assertBalancedTemplateRegions(source, file) {
  let inside = false;
  let regions = 0;
  for (const line of source.split(/\r?\n/)) {
    const marker = line.trim();
    if (marker === '<!-- assuredloop:template:start -->') {
      assert.equal(inside, false, `${file} nests reusable template regions`);
      inside = true;
      regions += 1;
    } else if (marker === '<!-- assuredloop:template:end -->') {
      assert.equal(inside, true, `${file} closes a missing reusable template region`);
      inside = false;
    }
  }
  assert.equal(inside, false, `${file} leaves a reusable template region open`);
  return regions;
}

function regionTokens(source) {
  const tokens = new Set();
  let inside = false;
  for (const line of source.split(/\r?\n/)) {
    const marker = line.trim();
    if (marker === '<!-- assuredloop:template:start -->') inside = true;
    else if (marker === '<!-- assuredloop:template:end -->') inside = false;
    else if (inside) {
      for (const match of line.matchAll(/\{\{([a-z_]+)\}\}/g)) tokens.add(match[1]);
    }
  }
  return tokens;
}

function assertNoRequiredTokens(source, file) {
  let inside = false;
  for (const line of source.split(/\r?\n/)) {
    const marker = line.trim();
    if (marker === '<!-- assuredloop:template:start -->') {
      inside = true;
      continue;
    }
    if (marker === '<!-- assuredloop:template:end -->') {
      inside = false;
      continue;
    }
    if (!inside) {
      for (const match of line.matchAll(/\{\{([a-z_]+)\}\}/g)) {
        assert.ok(installBindings.has(match[1]) === false, `${file} leaves required install token {{${match[1]}}}`);
      }
      assert.doesNotMatch(line, /\{\{[a-z_]+\}\}/, `${file} has unresolved required token outside a declared example`);
    }
  }
  assert.equal(inside, false, `${file} leaves a reusable region open`);
}

function assertSanitized(source, file) {
  for (const forbidden of forbiddenReusableIdentity) {
    assert.doesNotMatch(source, forbidden, `${file} contains consumer-specific reusable data`);
  }
}

async function readSnapshot(root, paths) {
  return new Map(await Promise.all(paths.map(async (relative) => [relative, await readFile(path.join(root, relative))])));
}

test('packaged operation guidance has usable frontmatter and sanitized content', async () => {
  const entries = (await readdir(skillsRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('assuredloop-'))
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(entries, operations.map((operation) => `assuredloop-${operation}`).sort());

  for (const directory of entries) {
    const relative = `skills/${directory}/SKILL.md`;
    const skillDirectory = path.join(skillsRoot, directory);
    assert.deepEqual((await readdir(skillDirectory)).sort(), ['SKILL.md'], `${relative} must be a single authored source file`);
    const source = await readFile(path.join(skillDirectory, 'SKILL.md'), 'utf8');
    const { fields, body } = parseFrontmatter(source, relative);
    assert.equal(fields.name, directory, `${relative} frontmatter name must match its namespaced asset`);
    assert.match(body, /\S/, `${relative} must contain usable guidance`);
    if (directory === 'assuredloop-record') {
      assert.match(source, authoritativeReference, `${relative} must point to its record field authority`);
    }
    assertBalancedTemplateRegions(source, relative);
    assertSanitized(source, relative);
  }
});

test('reusable record Markdown templates are present and defer field authority', async () => {
  const markdown = (await filesUnder(templatesRoot, (file) => file.endsWith('.md')))
    .filter((file) => !file.startsWith('records/'));
  for (const file of ['README.md', 'evidence-comment.md', 'work-issue.md', 'work-pr.md']) {
    assert.ok(markdown.includes(file), `missing reusable record template ${file}`);
  }
  for (const relative of markdown) {
    const source = await readFile(path.join(templatesRoot, relative), 'utf8');
    assertBalancedTemplateRegions(source, `templates/${relative}`);
    if (['README.md', 'evidence-comment.md', 'work-issue.md', 'work-pr.md'].includes(relative)) {
      assert.match(source, authoritativeReference, `templates/${relative} must name its record authority`);
    }
    assertSanitized(source, `templates/${relative}`);
  }
});

test('every shipped JSON example validates through the delivered record API', async () => {
  const files = (await filesUnder(path.join(templatesRoot, 'records'), (file) => file.endsWith('.json')))
    .filter((file) => !file.includes('/'));
  assert.deepEqual(files, [...templateKinds.keys()].sort());
  for (const file of files) {
    const value = JSON.parse(await readFile(path.join(templatesRoot, 'records', file), 'utf8'));
    const result = validateRecord(templateKinds.get(file), value);
    assert.equal(result.valid, true, `${file} must validate as ${templateKinds.get(file)}: ${JSON.stringify(result.errors)}`);
    assert.deepEqual(result.errors, []);
  }
});

test('README and a repository-agent pointer discover the same packaged guidance', async () => {
  const readme = await readFile(path.join(repositoryRoot, 'README.md'), 'utf8');
  for (const operation of operations) assert.ok(readme.includes(`skills/assuredloop-${operation}/SKILL.md`));
  assert.match(readme, /templates\//i);
  assert.match(readme, /schemas\/workflow\.schema\.json|contracts\//i);

  const pointerCandidates = ['AGENTS.md', '.agents/AGENTS.md', '.claude/AGENTS.md'];
  const pointers = [];
  for (const relative of pointerCandidates) {
    try {
      const source = await readFile(path.join(repositoryRoot, relative), 'utf8');
      pointers.push([relative, source]);
    } catch (error) {
      assert.equal(error.code, 'ENOENT');
    }
  }
  assert.ok(pointers.length > 0, 'repository-agent instructions must point to the packaged operation guidance');
  for (const [relative, source] of pointers) {
    assert.match(source, /README\.md|assuredloop-(?:adopt|record|context|sync)|skills\/assuredloop-/i,
      `${relative} must discover operation guidance directly or through the package README`);
    assert.match(source, /openspec|schema|contract/i, `${relative} must preserve native/authoritative context`);
  }
});

test('local initialization installs all namespaced guidance in Gemini and Codex roots without touching upstream files', async (t) => {
  const target = await makeGitFixture({
    prefix: 'assuredloop-guidance-consumer-',
    remote: 'https://github.com/example/guidance-consumer.git',
    files: {
      'README.md': '# Guidance consumer\n',
      'openspec/config.yaml': 'schema: spec-driven\n',
      'openspec/specs/product/spec.md': '# Consumer product requirements\n',
      '.gemini/skills/upstream-gemini/SKILL.md': '# Existing Gemini guidance\n',
      '.agents/skills/upstream-codex/SKILL.md': '# Existing Codex guidance\n',
      '.agents/skills/.openspec-target': 'codex\n',
    },
  });
  t.after(() => rm(target.root, { recursive: true, force: true }));

  const metadata = await readJson(path.join(repositoryRoot, 'contracts/metadata.json'));
  const config = makeConfig(metadata, {
    repository: 'example/guidance-consumer',
    tools: ['gemini', 'codex'],
  });
  const preservedPaths = [
    'README.md',
    'openspec/specs/product/spec.md',
    '.gemini/skills/upstream-gemini/SKILL.md',
    '.agents/skills/upstream-codex/SKILL.md',
    '.agents/skills/.openspec-target',
  ];
  const before = await readSnapshot(target.root, preservedPaths);
  const plan = await planInitialization({
    targetRoot: target.root,
    config,
    packageRoot: repositoryRoot,
    localOnly: true,
  });

  const expectedSourceSkills = operations.map((operation) => `assuredloop-${operation}`);
  const expectedInstallPaths = new Set([
    '.assuredloop/config.json',
    ...expectedSourceSkills.flatMap((skill) => [
      `.gemini/skills/${skill}/SKILL.md`,
      `.agents/skills/${skill}/SKILL.md`,
    ]),
  ]);
  assert.deepEqual(new Set(plan.files.map((file) => file.path)), expectedInstallPaths);
  assert.ok(plan.diagnostics.some((diagnostic) => diagnostic.code === 'github-skipped'));
  for (const file of plan.files.filter((entry) => entry.path.includes('/skills/assuredloop-'))) {
    assertNoRequiredTokens(file.content, `planned ${file.path}`);
  }

  const applied = await applyInitialization(plan);
  assert.equal(applied.status, 'applied');
  assert.deepEqual(await readJson(path.join(target.root, '.assuredloop/config.json')), config);
  for (const [relative, expected] of before) {
    assert.deepEqual(await readFile(path.join(target.root, relative)), expected, `${relative} must be preserved`);
  }

  for (const activity of expectedSourceSkills) {
    const sourcePath = path.join(skillsRoot, activity, 'SKILL.md');
    const source = await readFile(sourcePath, 'utf8');
    const tokens = regionTokens(source);
    const renderedCopies = await Promise.all(['.gemini', '.agents'].map((root) =>
      readFile(path.join(target.root, root, 'skills', activity, 'SKILL.md'), 'utf8')));
    for (const token of tokens) {
      if (!installBindings.has(token)) {
        for (const rendered of renderedCopies) assert.match(rendered, new RegExp(`\\{\\{${token}\\}\\}`));
      }
    }
  }
});
