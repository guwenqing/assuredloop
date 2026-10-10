// Result files (design.md 9; the T6 decision): what ran, its outcome, the
// commit it ran at (or "unknown") and its declared inputs, with optional
// by, source and note. This reads and checks the format only; whether a
// result applies to the current text is judged by the checks (T10).
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { Fail, read } from './base.js';
import { loadConfig } from './config.js';

const OUTCOMES = ['pass', 'fail', 'not run'];

export function loadResults(top) {
  const dir = String(loadConfig(top).results ?? '.assuredloop/results').replace(/\/+$/, '');
  let files = [];
  try { files = readdirSync(join(top, dir)).filter((f) => f.endsWith('.yaml')).sort(); } catch { return []; }
  return files.map((f) => {
    const file = `${dir}/${f}`;
    let r;
    // The failsafe schema keeps each value as written: a commit such as 0123456 stays text.
    try { r = parse(read(top, file), { schema: 'failsafe' }); } catch (e) { return { file, problems: [e instanceof Fail ? e.message : 'not YAML'] }; }
    if (!r || typeof r !== 'object' || Array.isArray(r)) return { file, problems: ['not a YAML map'] };
    const problems = [];
    for (const k of ['check', 'outcome', 'commit']) if (r[k] === undefined || r[k] === null || r[k] === '') problems.push(`no ${k}`);
    if (r.outcome != null && !OUTCOMES.includes(r.outcome)) problems.push(`outcome ${r.outcome}: one of ${OUTCOMES.join(', ')}`);
    if (r.commit != null && r.commit !== 'unknown' && !/^[0-9a-f]{7,40}$/.test(r.commit)) problems.push(`commit ${r.commit}: a 7-40 hex commit, or unknown`);
    const inputs = r.inputs ?? [];
    if (!Array.isArray(inputs)) problems.push('inputs: a list of {file, sha256}');
    else inputs.forEach((x, i) => {
      if (!x?.file) problems.push(`input ${i + 1}: no file`);
      if (!/^[0-9a-f]{64}$/.test(String(x?.sha256 ?? ''))) problems.push(`input ${i + 1}: sha256 is not 64 hex`);
    });
    return { file, check: r.check, outcome: r.outcome, commit: r.commit, inputs: Array.isArray(inputs) ? inputs : [], by: r.by, source: r.source, note: r.note, problems };
  });
}
