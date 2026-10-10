// The T2 retrieval measure on the visible golden questions (#181; tasks.md
// T13, T14). For each question with expected IDs: build its state of the
// invoicer world (test/v4/fixtures/invoicer, #179), search with the question's
// words in the query chosen below, and print the recall of the expected IDs
// in the top 5 and top 10, at level 0, level 1 and level 2 (the fixed test
// embedder; and the real model when packages/search/node_modules is there).
// The requirement sets no threshold, so the test asserts only that it ran.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { REPO } from './helpers/search.js';
import { KS, measureOne, pct, summary, useLevel2 } from './helpers/t2.js';

const QUESTIONS = parse(readFileSync(join(REPO, 'test/v4/fixtures/search/t2-questions.yaml'), 'utf8'));
const BUILDER = join(REPO, 'test/v4/helpers/invoicer.js');
const REAL = existsSync(join(REPO, 'packages/search/node_modules'));

// The fixture case of each question's state. Q13 and Q14 are about the
// market-report repo, whose base state is the case report-base.
const STATE = { Q13: 'res-c3', Q14: 'report-base' };
const REPO_OF = { Q13: 'market-report', Q14: 'market-report' };

// The query that fits each question (the test author's judgment):
// [] is the current system; --change <request> the change context; --history adds history.
const QUERY = {
  Q01: [], // "today, in the current system"
  Q02: ['--change', 'invoice-exports'], // the proposals of a change (one change per query: the spike's SP-2 is outside it)
  Q03: ['--change', 'invoice-exports'], // the requirement, sign-off and decision behind EXP-4
  Q04: ['--change', 'invoice-exports'], // the change paragraphs of invoice-exports
  Q05: ['--change', 'invoice-exports'], // closing invoice-exports
  Q06: ['--change', 'invoice-exports'], // closing invoice-exports
  Q07: ['--change', 'invoice-exports'], // a sign-off of invoice-exports
  Q08: ['--change', 'invoice-exports', '--history'], // what superseded SP-6
  Q09: ['--history'], // the trace of EXP-4 over three changes
  Q10: ['--change', 'tax-module'], // what an open change does
  Q11: ['--history'], // a concluded change after a squash merge
  Q12: ['--change', 'invoice-exports', '--history'], // an abandoned part
  Q13: ['--change', 'q3-report'], // a result of q3-report
  Q14: ['--change', 'q3-report'], // a result of q3-report
  Q15: [], // the current EXP-4
  Q16: ['--change', 'invoice-exports'], // an output of invoice-exports
  Q17: ['--change', 'reminder-emails'], // a proposal of reminder-emails
  Q18: ['--change', 'invoice-exports'], // the tasks of invoice-exports
  Q19: ['--change', 'link-expiry-spike'], // a spike
  Q20: ['--change', 'reminder-emails'], // a proposal of reminder-emails
};

const ARMS = [
  { name: 'level 0', level: 0 },
  { name: 'level 1', level: 1 },
  { name: 'level 2 (fixed embedder)', level: 2, kind: 'fixed' },
  ...(REAL ? [{ name: 'level 2 (real model)', level: 2, kind: 'real' }] : []),
];

test('T2: recall of the expected IDs in the top 5 and top 10, at each level (no threshold)', { timeout: 1_800_000 }, async (t) => {
  if (!existsSync(BUILDER) || !existsSync(join(REPO, 'test/v4/fixtures/invoicer'))) {
    t.skip('the invoicer world (test/v4/fixtures/invoicer and test/v4/helpers/invoicer.js, #179) is not in this tree yet');
    return;
  }
  const { invoicer, loadCase } = await import(BUILDER);
  const caseOf = (q) => STATE[q.id] ?? q.state;
  const known = (name) => { try { loadCase(name); return true; } catch { return false; } };
  const asked = QUESTIONS.filter((q) => q.expected_ids?.length);
  const missing = asked.filter((q) => !known(caseOf(q)));
  const measured = asked.filter((q) => known(caseOf(q)));
  if (missing.length) t.diagnostic(`not measured (state not in the fixture): ${missing.map((q) => `${q.id} (${caseOf(q)})`).join(', ')}`);
  assert.ok(measured.length > 0, 'at least one question has its state');

  const results = {};
  for (const arm of ARMS) {
    results[arm.name] = [];
    for (const state of [...new Set(measured.map(caseOf))]) {
      const dir = invoicer(t, state);
      if (arm.kind) useLevel2(dir, arm.kind);
      for (const q of measured.filter((x) => caseOf(x) === state)) {
        let query = QUERY[q.id] ?? [];
        const change = query[query.indexOf('--change') + 1];
        if (query.includes('--change') && !existsSync(join(dir, 'requests', change)) && !existsSync(join(dir, 'requests/archive', change))) {
          if (arm === ARMS[0]) t.diagnostic(`${q.id}: the state ${state} has no request ${change}, so the current system query is used`);
          query = query.filter((x, i) => x !== '--change' && i !== query.indexOf('--change') + 1);
        }
        const r = measureOne(dir, q, query, { level: arm.level, repo: REPO_OF[q.id] ?? 'invoicer', timeout: 600_000 });
        assert.equal(r.level, arm.level, `${arm.name}: ${q.id} answered at level ${r.level} (fallback: ${r.fallback})`);
        results[arm.name].push(r);
      }
    }
  }
  for (const arm of ARMS) {
    const s = summary(results[arm.name]);
    t.diagnostic(`${arm.name}: ${s.questions} questions; ${KS.map((k) => `recall@${k} ${pct(s[`macro@${k}`])} (micro ${pct(s[`micro@${k}`])})`).join('; ')}`);
  }
  for (const q of measured) {
    const row = ARMS.map((arm) => {
      const r = results[arm.name].find((x) => x.id === q.id);
      return `${arm.name} ${KS.map((k) => pct(r.recall[k])).join('/')}`;
    }).join(' | ');
    const last = results[ARMS.at(-1).name].find((x) => x.id === q.id);
    t.diagnostic(`${q.id} [${(QUERY[q.id] ?? []).join(' ') || 'current system'}] ${row}; missed at ${ARMS.at(-1).name}: ${last.missed.join(', ') || 'none'}`);
  }
});
