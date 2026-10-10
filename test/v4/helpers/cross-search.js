// The world of #186 (export and search across the output repos): the
// cross-repo world of T12 (helpers/cross-repo.js, not changed), with a few
// more commits on top. Nothing here reads the code under test.
//
//   invoicer-web     two more commits on main (selected as `commit: main`):
//                    C1 adds src/reminders.js (cites central:reminder-emails/SP-2),
//                       src/old-note.js (cites central:EXP-4), src/draft.js
//                       (cites central:EXP-6) and src/plain.js (bare IDs only);
//                    C2 deletes src/old-note.js and drops the cite of src/draft.js.
//   invoicer         one more commit X1 on its branch: src/link-check.js (bare
//                    EXP-4, not declared), src/token.js (central:EXP-6),
//                    docs/guide.md (bare EXP-4 and EXP-6), docs/encoding.md
//                    (UTF-8 and SHA-256 only), and invoice-exports declares
//                    invoicer-web config/link.json (a file that names no ID).
//   invoicer-worker  as in T12: pinned to the short hash of K5.
//   invoicer-mobile  as in T12: listed, never cloned.
import { renameSync } from 'node:fs';
import { join } from 'node:path';
import { blob, commit, crossRepo, rev, sha256, world } from './cross-repo.js';
import { git, readYaml, write, writeYaml } from './project.js';

export { blob, commit, crossRepo, rev, sha256 };

export const WEB_REMINDERS = [
  '// The reminder banner of the web app.',
  'export const bannerDays = [7, 14, 21];',
  '// Shown as central:reminder-emails/SP-2 says.',
  'export function banner(days) {',
  '  return `Reminder after ${days} days`;',
  '}',
  '',
].join('\n');
export const OLD_NOTE = '// Old note (central:EXP-4).\nexport const oldNote = 1;\n';
export const DRAFT_V1 = '// Draft of central:EXP-6.\nexport const draft = 2;\n';
export const DRAFT_V2 = '// Draft.\nexport const draft = 2;\n';
export const PLAIN = '// See EXP-4 and invoice-exports/R2, without the qualifier.\nexport const plain = 3;\n';

export const LINK_CHECK = '// Checks the link time of EXP-4.\nexport const minutes = 30;\n';
export const TOKEN = '// The token of central:EXP-6.\nexport const tokenBytes = 16;\n';
export const GUIDE = '# A guide for users\n\nThe link expires as EXP-4 says, and a used link stops (EXP-6).\nAsk support about anything else.\n';
export const ENCODING = '# Encoding\n\nEvery export is UTF-8, and each file has a SHA-256 hash.\n';

export const CLAIM = 'a claim, not proven';
export const NAMED = 'proves only that the ID is named';

const RECORD = '.assuredloop/records/requests/invoice-exports.yaml';

// The world with the commits above. Returns world(t) with `shas.ext`:
// { C1, C2, X1 } and `shas.web.result` (the commit that added the web result).
export function searchWorld(t) {
  const w = world(t);
  write(w.web, 'src/reminders.js', WEB_REMINDERS);
  write(w.web, 'src/old-note.js', OLD_NOTE);
  write(w.web, 'src/draft.js', DRAFT_V1);
  write(w.web, 'src/plain.js', PLAIN);
  const C1 = commit(w.web, 'Add the reminder banner and two notes');
  git(w.web, 'rm', '-q', 'src/old-note.js');
  write(w.web, 'src/draft.js', DRAFT_V2);
  const C2 = commit(w.web, 'Drop the old notes');

  write(w.central, 'src/link-check.js', LINK_CHECK);
  write(w.central, 'src/token.js', TOKEN);
  write(w.central, 'docs/guide.md', GUIDE);
  write(w.central, 'docs/encoding.md', ENCODING);
  const rec = readYaml(w.central, RECORD);
  rec.outputs = [...rec.outputs, { repo: 'invoicer-web', file: 'config/link.json', implements: ['central:EXP-4'] }];
  writeYaml(w.central, RECORD, rec);
  const X1 = commit(w.central, 'Add the link check, the user guide, and declare config/link.json');

  const result = addedAt(w.web, '.assuredloop/results/export-link-test.yaml');
  return { ...w, shas: { ...w.shas, web: { ...w.shas.web, result, main: C2 }, ext: { C1, C2, X1 } } };
}

// The first-parent commit that added <file> in the clone.
export const addedAt = (dir, file) => git(dir, 'log', '--first-parent', '--diff-filter=A', '--format=%H', '--', file).split('\n').at(-1);

// Rewrites the outputs of the central config and commits it (or not, with commitIt false).
export function setOutputs(w, change, { commitIt = true, message = 'Change the output repos' } = {}) {
  const cfg = readYaml(w.central, '.assuredloop/config.yaml');
  cfg.outputs = change(cfg.outputs);
  writeYaml(w.central, '.assuredloop/config.yaml', cfg);
  return commitIt ? commit(w.central, message) : null;
}

// Sets the commit of one output repo in the central config.
export const pin = (w, name, commitText, opts) => setOutputs(w, (outs) => outs.map((o) => (o.name === name ? { ...o, commit: commitText } : o)), opts);

// Moves a clone away, so that its path does not exist.
export function hide(w, name) {
  const from = join(w.root, name);
  renameSync(from, `${from}.gone`);
}

// The lines of `text` that name a qualified central ID (interface-180.md, 2),
// as "<n>: <line>", joined by newlines: the text of an output row of an output repo.
const QUALIFIED = /central:(?:[a-z0-9][a-z0-9-]*\/)?(?:[A-Z][A-Z0-9]*-\d+(?:-\d+)?|[RQDST]\d+)/;
export const namedLines = (text) => text.split('\n').map((l, i) => [i + 1, l])
  .filter(([, l]) => QUALIFIED.test(l)).map(([n, l]) => `${n}: ${l}`).join('\n');

// The rows of one repo, as "<id> v<version> <role>".
export const listOf = (rows, repo) => rows.filter((r) => r.repo === repo).map((r) => `${r.id} v${r.version} ${r.role}`);
export const rowOf = (rows, repo, id, version) => {
  const found = rows.filter((r) => r.repo === repo && r.id === id && (version === undefined || r.version === version));
  if (found.length !== 1) throw new Error(`one row ${repo} ${id}${version ? ` v${version}` : ''}, found ${found.length}:\n${listOf(rows, repo).join('\n')}`);
  return found[0];
};
