// Checks every command's stdout must pass [VW-9].
import assert from 'node:assert/strict';

export function lines(stdout) {
  return stdout.replace(/\n+$/, '').split('\n');
}

// Names what it read, ends with Next then Not known, and holds no age. The
// Read line names the main read: origin/main with the time git recorded for
// it, or local main (the no-main label holds "origin/main" too, so a bare
// substring would not tell them apart).
export function assertFrame(stdout, { read = 'working tree', main = 'local main' } = {}) {
  assert.ok(stdout.includes(read), `output should name ${JSON.stringify(read)}:\n${stdout}`);
  const ls = lines(stdout);
  const readLine = ls.find((l) => /^Read\b/.test(l)) ?? '';
  if (main === 'origin/main') assert.match(readLine, /^Read .*· origin\/main as of /, `the Read line should name origin/main as of a time:\n${stdout}`);
  else assert.ok(readLine.includes(`· ${main}`), `the Read line should name ${JSON.stringify(main)}:\n${stdout}`);
  assert.ok(ls.length >= 2, `output too short:\n${stdout}`);
  assert.match(ls.at(-2), /^Next/, `second last line should start with Next:\n${stdout}`);
  assert.match(ls.at(-1), /^Not known/, `last line should start with Not known:\n${stdout}`);
  assert.doesNotMatch(stdout, /\bago\b/i, `output should not state an age:\n${stdout}`);
}

// The line that says `not ok` also names the file.
export function assertNotOk(stdout, file) {
  assert.ok(lines(stdout).some((l) => l.includes('not ok') && l.includes(file)),
    `expected a "not ok" line naming ${file}:\n${stdout}`);
}
