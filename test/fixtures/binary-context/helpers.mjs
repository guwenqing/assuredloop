import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { git } from '../adoption/helpers.js';
import { makeTraceFixture } from '../trace-cli/helpers.mjs';

export { git };

export const repository = 'example/consumer';
export const work = `${repository}#42`;
export const binaryBytes = Buffer.from([
  0x00, 0xff, 0x7b, 0xc3, 0x28, 0xfe, 0x0a, 0x80,
]);

export async function makeBinaryFixture(t) {
  const fixture = await makeTraceFixture(t);
  await mkdir(path.join(fixture.root, 'docs'), { recursive: true });
  await writeFile(path.join(fixture.root, 'docs/binary.bin'), binaryBytes);
  await writeFile(path.join(fixture.root, 'docs/notes.md'), '# Readable context\n\nThe adjacent binary source is retained by identity.\n');
  await git(fixture.root, ['add', 'docs/binary.bin', 'docs/notes.md']);
  await git(fixture.root, ['commit', '-q', '-m', 'add binary context fixture']);
  const binaryRevision = (await git(fixture.root, ['rev-parse', 'HEAD'])).stdout.trim();
  const statusBefore = (await git(fixture.root, ['status', '--porcelain'])).stdout;
  return {
    ...fixture,
    repository,
    work,
    binaryBytes,
    statusBefore,
    binaryRef: { repository, revision: binaryRevision, path: 'docs/binary.bin' },
    binaryPlanRef: { repository, revision: binaryRevision, path: 'docs/binary.bin', items: ['3.1'] },
    anchoredBinaryRef: { repository, revision: binaryRevision, path: 'docs/binary.bin', anchor: 'binary-section' },
    textRef: { repository, revision: binaryRevision, path: 'docs/notes.md' },
  };
}

export function bodyFor(record) {
  return `Fixture source context.\n\n## Workflow context\n\n\`\`\`json\n${JSON.stringify(record, null, 2)}\n\`\`\`\n`;
}

export function issueSnapshot(record, number = 42) {
  return {
    number,
    repository_url: `https://api.github.com/repos/${repository}`,
    state: 'open',
    body: bodyFor(record),
  };
}
