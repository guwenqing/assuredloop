// al check (design.md 3, What the script checks): the lints of every marker in
// scope, and per scope the ID lints of the branch against its base (lost, used
// again, one ID in two files), then each paragraph's change (T8); then the
// checks that read records (T10, checks.js). The base is baseOf (git.js), the
// merge-base of HEAD with main or origin/main; the head is the working tree.
// It exits 0; with --strict, 1 when it prints a `not ok`. A finding has the
// same severity in both modes: the marker and ID lints are hints for the
// review, and only the exact rules of checks.js are `not ok` (#238). With --issues <folder> it also checks the
// work items that the caller saved there (issue-hints R1).
import { relative } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { read, recordPath } from './base.js';
import { loadConfig, loadSchema } from './config.js';
import { baseOf } from './git.js';
import { diffParagraphs, idLints } from './ids.js';
import { docsInScope, idsEverUsed, isShallow, notRead, parseScopes, rootNotOk, rootProblem, SPEC } from './scope.js';
import { Fail } from './spec.js';
import { centralLookup } from './repos.js';
import { checks } from './checks.js';
import { loadPhrases } from './phrases.js';
import { loadItems } from './issues.js';

// A file or folder that al check cannot read, and that no check reports as
// not ok, stops it with a refusal: never an internal error, never a pass (#238).
const UNREADABLE = new Set(['EACCES', 'EPERM', 'EISDIR', 'ENOTDIR', 'ELOOP']);
export function check(args) {
  try {
    return checkAll(args);
  } catch (e) {
    if (e instanceof Fail || !UNREADABLE.has(e.code) || !e.path) throw e;
    throw new Fail(`${relative(args.top, e.path)} cannot be read`, 'make it readable, then run al check again');
  }
}

function checkAll({ top, cwd, opts }) {
  const config = loadConfig(top);
  const root = rootProblem(config);
  if (root) throw new Fail(root, 'fix root: in .assuredloop/config.yaml');
  const { kinds } = loadSchema(top);
  // A bad phrases: list is a refusal before anything is read (issue-hints D6).
  const phrases = loadPhrases(config);
  // The work items that the caller saved; a folder that is not there is a refusal.
  const issues = opts.issues === undefined ? null : loadItems(cwd ?? top, opts.issues);
  const found = baseOf(top);
  const base = found?.commit ?? null;
  const now = parseScopes(docsInScope(top, config), kinds);
  const was = base ? parseScopes(docsInScope(top, config, base), kinds) : null;
  const used = base ? idsEverUsed(top, config, base) : null;
  // A change spec's removes: names spec paragraphs.
  const removes = [...now.scopes].filter(([s]) => s !== SPEC).flatMap(([, ps]) => ps.flatMap((p) => p.links.removes));

  // Each marker and ID lint is a hint for the review, in every mode (#238).
  const lints = [...now.lints];
  const changes = [];
  for (const scope of new Set([...now.scopes.keys(), ...(was?.scopes.keys() ?? [])])) {
    const head = now.scopes.get(scope) ?? [];
    const before = was?.scopes.get(scope) ?? [];
    if (!base) {
      lints.push(...idLints(head, head));
      continue;
    }
    lints.push(...idLints(before, head, { everUsed: used.get(scope) ?? [], removes: scope === SPEC ? removes : [] }).map((l) => deleted(top, l)));
    changes.push(...diffParagraphs(before, head).filter((c) => c.changes.length));
  }

  const t10 = checks(top, { base, phrases, issues });
  // An adopted paragraph needs no link while its text is the captured text (D16).
  const shown = lints.filter((l) => !(l.code === 'no-link' && t10.adopted.has(l.id) && !l.file.startsWith('requests/'))).map((l) => ({ ...l, severity: 'hint' }));
  lints.length = 0;
  lints.push(...shown);
  const body = notRead(top, config);
  // A root that config sets but that is not read is a not ok, as in al index (#218).
  const rootLine = rootNotOk(top, config);
  if (rootLine) body.push(rootLine);
  body.push(...lints.map((l) => `${l.severity} ${l.code} ${l.file}:${l.line} ${l.id ?? '-'} ${l.message}`));
  if (base) body.push(...changes.map((c) => `${c.file} ${c.id} ${c.changes.join('+')}`));
  if (!lints.length) body.push('ok: no marker lint');
  body.push(...t10.findings.map((f) => `${f.severity} ${f.code} ${f.where} ${f.id} ${f.message}`));
  const notOk = Boolean(rootLine) || lints.some((l) => l.severity === 'not ok') || t10.findings.some((f) => f.severity === 'not ok');
  // In an output repo: the central IDs that the branch's changed files cite (T12).
  const central = centralLookup(top);
  body.push(...central.body);
  const notKnown = ['IDs used on branches that were never fetched here', ...t10.notKnown, ...central.notKnown,
    'whether each kind is right, whether a requirement is fully covered, and whether a change is authorized in substance (the review judges these)'];
  if (!base) notKnown.unshift('no base (no main branch, or no commit): lost and used-again IDs are not checked');
  else if (isShallow(top)) notKnown.unshift('IDs used before the shallow history begins');
  return {
    body,
    read: base ? `working tree · base ${base.slice(0, 7)} (merge-base with ${found.ref})` : 'working tree · no base',
    next: nextStep([...(rootLine ? ['not ok'] : []), ...lints.map((l) => l.severity), ...t10.findings.map((f) => f.severity),
      ...central.body.map((l) => (/^not ok /.test(l) ? 'not ok' : /^hint /.test(l) ? 'hint' : 'info'))], lints.some((l) => l.code === 'no-id'),
      t10.findings.some((f) => f.code === 'unsigned-requirement')),
    notKnown,
    exit: opts.strict && notOk ? 1 : 0,
  };
}

// A lost ID of an open request's change spec (its file at the base is
// requests/<name>/spec.md): deleting a paragraph there is ordinary editing,
// so it is a hint that names the deletion and each disposition or wording
// decision of the request's record that names the ID (#230, D1-D4).
const OPEN_SPEC = /^requests\/(?!archive\/)([^/]+)\/spec\.md$/;
function deleted(top, l) {
  const name = l.code === 'lost-id' && OPEN_SPEC.exec(l.file)?.[1];
  if (!name) return l;
  const source = `${name}/${l.id}`;
  let rec;
  try {
    rec = parseYaml(read(top, recordPath(name)) ?? 'null');
  } catch {
    rec = null;
  }
  const list = (x) => (Array.isArray(x) ? x : []);
  const says = { incorporated: (d) => `incorporated as ${d.spec}`, removed: (d) => `removed ${d.spec}`, superseded: (d) => `superseded by ${d.by}` };
  const facts = [
    ...list(rec?.dispositions).filter((d) => d?.source === source && says[d.disposition]).map((d) => `its disposition says ${says[d.disposition](d)}`),
    ...list(rec?.decisions).filter((d) => d?.wording?.source === source).map((d) => `decision ${d.id} names its wording`),
  ];
  const message = `${source} is deleted${facts.map((f) => `; ${f}`).join('')}. If that is on purpose, nothing more is needed: the ID is retired and never used again.`;
  return { ...l, message };
}

// The Next line names what to do for what printed: a not ok, a hint, both, or
// neither (#198); and for an unsigned requirement, how to get it signed (#238).
function nextStep(severities, noId, unsigned) {
  const notOk = severities.includes('not ok');
  const hint = severities.includes('hint');
  const addIds = (noId ? '; al spec --add-ids <file> marks the paragraphs with no ID' : '')
    + (unsigned ? '; for an unsigned requirement, run al index, then ask the owner to sign it (al record <name> signoff)' : '');
  if (notOk && hint) return `fix each not ok, and deal with each hint or say in the PR why it stays${addIds}`;
  if (notOk) return `fix each not ok${addIds}`;
  if (hint) return 'deal with each hint, or say in the PR why it stays';
  return 'al context';
}
