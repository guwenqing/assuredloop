import { rm } from 'node:fs/promises';

import { git, makeGitFixture } from '../adoption/helpers.js';

export { git };

export const repository = 'example/consumer';
export const work = `${repository}#42`;
export const binaryBytes = Buffer.from([
  0x00, 0xff, 0x7b, 0xc3, 0x28, 0xfe, 0x0a, 0x80,
]);

export async function makeBinaryFixture(t) {
  const fixture = await makeGitFixture({
    prefix: 'assuredloop-binary-context-',
    remote: `https://github.com/${repository}.git`,
    files: {
      'docs/binary.bin': binaryBytes,
      'docs/notes.md': '# Readable context\n\nThe adjacent binary source is retained by identity.\n',
    },
  });
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const statusBefore = (await git(fixture.root, ['status', '--porcelain'])).stdout;
  return {
    ...fixture,
    repository,
    work,
    binaryBytes,
    statusBefore,
    binaryRef: { repository, revision: fixture.revision, path: 'docs/binary.bin' },
    binaryPlanRef: { repository, revision: fixture.revision, path: 'docs/binary.bin', items: ['3.1'] },
    anchoredBinaryRef: { repository, revision: fixture.revision, path: 'docs/binary.bin', anchor: 'binary-section' },
    textRef: { repository, revision: fixture.revision, path: 'docs/notes.md' },
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
