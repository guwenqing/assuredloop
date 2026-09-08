import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  git,
  makeTraceFixture,
  saveScenario,
  scenarioOf,
  workIssue,
} from '../trace-external-boundaries/helpers.mjs';

const repository = 'example/consumer';
const malformedPath = 'bad-context.md';
const paddingCommentCount = 25;
const paddingCommentBytes = 2800;

export async function makeLateSourcePaginationFixture(t) {
  const fixture = await makeTraceFixture(t);
  const malformedBody = '## Workflow context\n\n```json\n{"command": }\n```\n';
  await writeFile(path.join(fixture.root, malformedPath), malformedBody);
  await git(fixture.root, ['add', malformedPath]);
  await git(fixture.root, ['commit', '-q', '-m', 'add malformed changed-root fixture']);
  const changedRevision = (await git(fixture.root, ['rev-parse', 'HEAD'])).stdout.trim();

  const scenario = await scenarioOf(fixture);
  const padding = Array.from({ length: paddingCommentCount }, (_, index) => {
    const id = 2100 + index;
    const body = `Padding ${index}: ${'x'.repeat(paddingCommentBytes - `Padding ${index}: `.length)}`;
    return { id, body };
  });
  scenario.records['issues/42/comments'][0].push(...padding);
  for (const comment of padding) scenario.records[`issues/comments/${comment.id}`] = comment;
  scenario.records['issues/42/timeline'] = [scenario.records['issues/42/timeline'][0]];
  scenario.records['pulls/43'].head.sha = changedRevision;
  scenario.records['pulls/43/files'] = [[{ filename: malformedPath, status: 'added' }]];
  await saveScenario(fixture, scenario);

  return {
    ...fixture,
    changedRevision,
    malformedPath,
    malformedBody,
    work: workIssue,
    paddingCommentIds: padding.map(({ id }) => id),
  };
}

export function expectedMalformedSource(fixture) {
  return { repository, revision: fixture.changedRevision, path: fixture.malformedPath };
}

export function expectedPaddingReferences(fixture) {
  return fixture.paddingCommentIds.map((comment_id) => ({ repository, comment_id }));
}
