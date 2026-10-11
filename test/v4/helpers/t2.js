// The T2 retrieval measure (#181; tasks.md T13 and T14: "the T2 retrieval
// questions measured by recall of the expected IDs, level 1 against level 2").
// For one built state and a list of questions: search with each question's
// words in the chosen query, and count the expected IDs in the top k hits.
import { besideAl, installEmbedder, search } from './search.js';

export const KS = [5, 10];

// The ID as an export row names it: "<repo>:<path>" of the central repo is its path.
export const rowId = (id, repo) => (repo && id.startsWith(`${repo}:`) ? id.slice(repo.length + 1) : id);

// Makes `dir` answer at level 2 with the fixed test embedder ('fixed', a
// stand-in @huggingface/transformers in the project) or the real model
// ('real': the real library resolves beside al, from the repo top, so the
// project needs nothing).
export function useLevel2(dir, kind) {
  if (kind === 'fixed') return installEmbedder(dir);
  if (!besideAl()) throw new Error('the real model needs @huggingface/transformers installed at the repo top');
  return null;
}

// One question in one state: { id, level, fallback, recall: {5: r, 10: r}, found, missed }.
// `query` is a list of extra arguments: [], ['--change', <request>], ['--history'] or both.
export function measureOne(dir, q, query, { level, repo, timeout } = {}) {
  const out = search(dir, [q.ask, ...query, '--limit', String(Math.max(...KS))], { level: level === 2 ? undefined : level, timeout });
  const want = [...new Set(q.expected_ids.map((id) => rowId(String(id), repo)))];
  const got = out.hits.map((h) => h.id);
  const recall = {};
  for (const k of KS) {
    const top = new Set(got.slice(0, k));
    recall[k] = want.filter((id) => top.has(id)).length / want.length;
  }
  const top = new Set(got.slice(0, Math.max(...KS)));
  return { id: q.id, level: out.level, fallback: out.fallback, recall, found: want.filter((id) => top.has(id)), missed: want.filter((id) => !top.has(id)), want };
}

// Mean recall at each k over results (macro), and the share of all expected IDs found (micro).
export function summary(results) {
  const s = { questions: results.length };
  for (const k of KS) {
    s[`macro@${k}`] = results.length ? results.reduce((a, r) => a + r.recall[k], 0) / results.length : null;
    const all = results.reduce((a, r) => a + r.want.length, 0);
    s[`micro@${k}`] = all ? results.reduce((a, r) => a + r.recall[k] * r.want.length, 0) / all : null;
  }
  return s;
}

export const pct = (x) => (x === null ? 'n/a' : `${(100 * x).toFixed(1)}%`);
