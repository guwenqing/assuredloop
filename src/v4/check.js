// al check, the marker part (design.md 3, What the script checks): the lints of
// every marker in scope, and per scope the ID lints of the branch against its
// base (lost, used again, one ID in two files), then each paragraph's change.
// The base is the merge-base of HEAD with main; the head is the working tree.
// It exits 0; with --strict, 1 when it prints any lint.
import { loadConfig, loadSchema } from './config.js';
import { mergeBase } from './git.js';
import { diffParagraphs, idLints } from './ids.js';
import { docsInScope, idsEverUsed, isShallow, notRead, parseScopes, rootProblem, SPEC } from './scope.js';
import { Fail } from './spec.js';

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

  const severity = (l) => (opts.strict ? 'not ok' : l.severity);
  const body = notRead(top, config);
  body.push(...lints.map((l) => `${severity(l)} ${l.code} ${l.file}:${l.line} ${l.id ?? '-'} ${l.message}`));
  if (base) body.push(...changes.map((c) => `${c.file} ${c.id} ${c.changes.join('+')}`));
  if (!lints.length) body.push('ok: no marker lint');
  const notKnown = ['IDs used on branches that were never fetched here', 'whether links resolve, and the checks that read records (T10)'];
  if (!base) notKnown.unshift('no base (no main branch, or no commit): lost and used-again IDs are not checked');
  else if (isShallow(top)) notKnown.unshift('IDs used before the shallow history begins');
  return {
    body,
    read: base ? `working tree · base ${base.slice(0, 7)} (merge-base with main)` : 'working tree · no base',
    next: lints.length ? 'fix each not ok; al-v4 spec --add-ids <file> marks the paragraphs with no ID' : 'al-v4 spec',
    notKnown,
    exit: opts.strict && lints.length ? 1 : 0,
  };
}
