// Old records that hold dispositions and wording decisions (#179, task T10;
// #72, LD-58 and LD-9). #72 removed the dispositions, their validity and the
// wording decisions from al: an old record that holds them stays readable,
// and al check no longer checks them. The states of the invoicer world that
// hold such records (test/v4/fixtures/invoicer/cases/cr-*.yaml) give no
// finding with the code `disposition` or `disposition-pending`, plain or
// --strict.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { check, invoicer } from './helpers/invoicer.js';
import { show } from './helpers/project.js';

const run = (t, name, ...args) => {
  const dir = invoicer(t, name);
  return { dir, ...check(dir, ...args) };
};
const dispositionFindings = (r) => r.findings.filter((f) => f.code === 'disposition' || f.code === 'disposition-pending');

for (const name of ['cr-wording', 'cr-revert', 'cr-supersede', 'cr-chain', 'cr-abandon', 'cr-45']) {
  test(`${name}: an old record with dispositions reads with no disposition finding, plain and --strict`, (t) => {
    const r = run(t, name);
    assert.equal(r.code, 0, show(r));
    assert.deepEqual(dispositionFindings(r), [], show(r));
    const strict = run(t, name, '--strict');
    assert.deepEqual(dispositionFindings(strict), [], show(strict));
  });
}
