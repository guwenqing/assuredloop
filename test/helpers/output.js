// Checks every command's stdout must pass [VW-9].
import assert from 'node:assert/strict';

export function lines(stdout) {
  return stdout.replace(/\n+$/, '').split('\n');
}

// Names what it read, ends with Next then Not known, and holds no age.
export function assertFrame(stdout, { read = 'working tree', main = 'local main' } = {}) {
  assert.ok(stdout.includes(read), `output should name ${JSON.stringify(read)}:\n${stdout}`);
  assert.ok(stdout.includes(main), `output should name ${JSON.stringify(main)}:\n${stdout}`);
  const ls = lines(stdout);
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
