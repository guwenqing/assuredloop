// al check (design.md 3, What the script checks): the lints of every marker in
// scope, and per scope the ID lints of the branch against its base (lost, used
// again, one ID in two files), then each paragraph's change (T8); then the
// checks that read records (T10, checks.js). The base is the merge-base of
// HEAD with main; the head is the working tree. It exits 0; with --strict, 1
// when it prints a `not ok`. --strict raises every marker lint and an invalid
// disposition to `not ok`; the hints that need judgment stay hints.
import { loadConfig, loadSchema } from './config.js';
import { mergeBase } from './git.js';
import { diffParagraphs, idLints } from './ids.js';
import { docsInScope, idsEverUsed, isShallow, notRead, parseScopes, rootProblem, SPEC } from './scope.js';
import { Fail } from './spec.js';
import { centralLookup } from './repos.js';
import { checks } from './checks.js';

export function check({ top, opts }) {
  const config = loadConfig(top);
  const root = rootProblem(config);
  if (root) throw new Fail(root, 'fix root: in .assuredloop/config.yaml');
  const { kinds } = loadSchema(top);
  const base = mergeBase(top);
  const now = parseScopes(docsInScope(top, config), kinds);
  const was = base ? parseScopes(docsInScope(top, config, base), kinds) : null;
  const used = base ? idsEverUsed(top, config, base) : null;
  // A change spec's removes: names spec paragraphs.
  const removes = [...now.scopes].filter(([s]) => s !== SPEC).flatMap(([, ps]) => ps.flatMap((p) => p.links.removes));

  const lints = [...now.lints];
  const changes = [];
  for (const scope of new Set([...now.scopes.keys(), ...(was?.scopes.keys() ?? [])])) {
    const head = now.scopes.get(scope) ?? [];
    const before = was?.scopes.get(scope) ?? [];
    if (!base) {
      lints.push(...idLints(head, head));
      continue;
    }
    lints.push(...idLints(before, head, { everUsed: used.get(scope) ?? [], removes: scope === SPEC ? removes : [] }));
    changes.push(...diffParagraphs(before, head).filter((c) => c.changes.length));
  }

  const t10 = checks(top, { base, strict: opts.strict });
  // An adopted paragraph needs no link while its text is the captured text (D16).
  const shown = lints.filter((l) => !(l.code === 'no-link' && t10.adopted.has(l.id) && !l.file.startsWith('requests/')));
  lints.length = 0;
  lints.push(...shown);
  const severity = (l) => (opts.strict ? 'not ok' : l.severity);
  const body = notRead(top, config);
  body.push(...lints.map((l) => `${severity(l)} ${l.code} ${l.file}:${l.line} ${l.id ?? '-'} ${l.message}`));
  if (base) body.push(...changes.map((c) => `${c.file} ${c.id} ${c.changes.join('+')}`));
  if (!lints.length) body.push('ok: no marker lint');
  body.push(...t10.findings.map((f) => `${f.severity} ${f.code} ${f.where} ${f.id} ${f.message}`));
  // Under --strict every marker lint is a not ok.
  const notOk = lints.length > 0 || t10.findings.some((f) => f.severity === 'not ok');
  // In an output repo: the central IDs that the branch's changed files cite (T12).
  const central = centralLookup(top);
  body.push(...central.body);
  const notKnown = ['IDs used on branches that were never fetched here', ...t10.notKnown, ...central.notKnown,
    'whether each kind is right, whether a requirement is fully covered, and whether a change is authorized in substance (the review judges these)'];
  if (!base) notKnown.unshift('no base (no main branch, or no commit): lost and used-again IDs are not checked');
  else if (isShallow(top)) notKnown.unshift('IDs used before the shallow history begins');
  return {
    body,
    read: base ? `working tree · base ${base.slice(0, 7)} (merge-base with main)` : 'working tree · no base',
    next: lints.length ? 'fix each not ok; al-v4 spec --add-ids <file> marks the paragraphs with no ID'
      : t10.findings.some((f) => f.severity !== 'info') ? 'deal with each not ok and hint, or say in the PR why it stays' : 'al-v4 context',
    notKnown,
    exit: opts.strict && notOk ? 1 : 0,
  };
}
