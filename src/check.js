import { fail, git } from './files.js';
import { createReadAdapter, workIdentity } from './read-adapter.js';

export async function checkWork({ targetRoot, work, localOnly = false } = {}) {
  const { repository } = workIdentity(work);
  const adapter = await createReadAdapter({ targetRoot, repository, localOnly });
  if (!localOnly) fail('command-unavailable', 'Live workflow checks are not yet implemented.');
  const revision = await git(adapter.targetRoot, ['rev-parse', 'HEAD']);
  return {
    operation: 'check', mode: 'local-only', status: 'incomplete', repository, work, revision,
    findings: [
      { code: 'github-skipped', message: 'GitHub records and live destination freshness were not read.' },
      { code: 'policy-unavailable', message: 'A local snapshot does not establish the actual PR destination or its governing policy.' },
    ],
  };
}
