import assert from 'node:assert/strict';
import { execFile as callback } from 'node:child_process';
import { appendFile, cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { promisify, isDeepStrictEqual } from 'node:util';
import { routedPrerequisiteFixture } from '../issue37-routing/prerequisite.mjs';
import { makeCloseoutFixture, bodyFor } from '../closeout-cli/helpers.mjs';
import { structuredBody } from '../../../src/trace.js';
const exec = promisify(callback);
const repository = 'example/consumer';
export const oldRef = { repository, comment_id: 403 };
export const dispositionRef = { repository, comment_id: 404 };

async function nativeLink(t, toolkitRoot) {
  const isolated = await mkdtemp(path.join(os.tmpdir(), 'issue37-native-link-'));
  t.after(() => rm(isolated, { recursive: true, force: true }));
  const prefix = path.join(isolated, 'prefix');
  const overrides = { npm_config_prefix: prefix, npm_config_cache: path.join(isolated, 'cache'),
    npm_config_userconfig: path.join(isolated, 'user.npmrc'), npm_config_globalconfig: path.join(isolated, 'global.npmrc') };
  await writeFile(overrides.npm_config_userconfig, ''); await writeFile(overrides.npm_config_globalconfig, '');
  const args = ['link', '--ignore-scripts', '--offline', '--no-audit', '--no-fund'];
  const linked = await exec('npm', args, { cwd: toolkitRoot, env: { ...process.env, ...overrides } });
  const executable = path.join(prefix, 'bin/assuredloop');
  assert.equal(await realpath(executable), await realpath(path.join(toolkitRoot, 'src/cli.js')));
  if (process.env.ISSUE37_LIFECYCLE_LINK_LOG) await appendFile(process.env.ISSUE37_LIFECYCLE_LINK_LOG,
    JSON.stringify({ command: 'npm', args, cwd: toolkitRoot, selected_env: overrides, exit: 0,
      stdout: linked.stdout, stderr: linked.stderr, executable }) + '\n');
  return executable;
}
async function cli(f, executable, extras = [], operation = 'check', work = 'example/consumer#43') {
  const args = [executable, operation, '--target', f.root, '--work', work, ...extras];
  try { const raw = await exec(process.execPath, args, { env: f.env, maxBuffer: 16 * 1024 * 1024 }); return { ...raw, exit: 0, value: JSON.parse(raw.stdout) }; }
  catch (error) { if (!error.stdout) throw error; return { stdout: error.stdout, stderr: error.stderr, exit: error.code, value: JSON.parse(error.stdout) }; }
}

export const disposition = 'Author disposition: earlier REVISE is retained; the current independent assessment must judge whether its specific findings are resolved. No automatic supersession.';
export async function prerequisite(t, { verdict = 'revise', mode = 'fresh' } = {}) {
  const f = await routedPrerequisiteFixture(t);
  const records = f.store.records;
  const old = { ...structuredClone(f.originalReviews[0]), head: f.historicalBase, result: verdict, reviewer_session: 'retained-earlier-reviewer' };
  let reviews = f.originalReviews;
  if (mode === 'old-only') reviews = [];
  if (mode === 'wrong-base-only') { reviews = structuredClone(reviews); reviews.forEach((record) => { record.base_sha = f.reviewedHead; }); }
  if (mode === 'wrong-policy-only') { reviews = structuredClone(reviews); reviews.forEach((record) => { record.policy_ref.revision = f.historicalBase; }); }
  if (mode === 'malformed') old.review_kind = 'not-a-role';
  if (mode === 'wrong-pr') old.pr = `${repository}#999`;
  for (const record of reviews) record.evidence.push(oldRef, dispositionRef);
  const comments = reviews.map((record, index) => ({ id: 401 + index, body: bodyFor(record) }));
  const oldComment = { id: 403, body: bodyFor(old, 'Retained prior independent assessment; its verdict is not rewritten.') };
  records['issues/40/comments'] = [[oldComment, ...comments, { id: 404, body: disposition }]];
  for (const comment of records['issues/40/comments'][0]) records[`issues/comments/${comment.id}`] = comment;
  if (mode === 'unavailable-source') {
    delete records['issues/comments/403'];
    // A complete listing already supplies the same source. Remove it there too
    // so this fault models an unavailable comment, not inconsistent endpoints.
    records['issues/40/comments'] = [records['issues/40/comments'][0].filter((comment) => comment.id !== 403)];
  }
  await f.save();
  const executable = await nativeLink(t, f.toolkitRoot);
  return { ...f, old, oldComment, reviews, run: () => cli(f, executable), inspect: () => cli(f, executable, ['--max-inline-bytes', '65536'], 'inspect', 'example/consumer#40') };
}
export async function closeout(t, { oldOnly = false } = {}) {
  const f = await makeCloseoutFixture(t);
  const store = JSON.parse(await readFile(f.env.FAKE_GH_SCENARIO, 'utf8')); const records = store.records;
  const owner = records['issues/80']; owner.state = 'open'; owner.state_reason = null;
  owner.labels = [{ name: f.config.repository.labels.type['architecture-task'] }];
  const ownerRecord = await structuredBody(owner.body); ownerRecord.activity = 'plan'; owner.body = bodyFor(ownerRecord);
  const work = await structuredBody(records['issues/90'].body); work.depends_on = [f.prerequisitePull]; records['issues/90'].body = bodyFor(work);
  const currentBody = records['issues/comments/801'].body;
  const current = await structuredBody(currentBody);
  const old = { ...structuredClone(current), head: f.baseRevision, result: 'revise', reviewer_session: 'retained-closeout-prerequisite-reviewer' };
  old.evidence.push(dispositionRef);
  const comments = [{ id: 403, body: bodyFor(old, disposition) }, ...(!oldOnly ? [{ id: 801, body: currentBody }] : []), { id: 404, body: disposition }];
  records['issues/80/comments'] = [comments]; records['issues/81/comments'] = [[]];
  for (const comment of comments) records[`issues/comments/${comment.id}`] = comment;
  await writeFile(f.env.FAKE_GH_SCENARIO, JSON.stringify(store));
  const sourceRoot = new URL('../../../', import.meta.url).pathname;
  const toolkitRoot = await mkdtemp(path.join(os.tmpdir(), 'issue37-closeout-toolkit-'));
  t.after(() => rm(toolkitRoot, { recursive: true, force: true }));
  for (const name of ['src', 'schemas', 'package.json']) await cp(path.join(sourceRoot, name), path.join(toolkitRoot, name), { recursive: true });
  await symlink(path.join(sourceRoot, 'node_modules'), path.join(toolkitRoot, 'node_modules'), 'dir');
  const executable = await nativeLink(t, toolkitRoot);
  return { ...f, old, run: () => cli(f, executable, ['--delta-ref', JSON.stringify(f.deltaRef), '--manifest-ref', JSON.stringify(f.manifestRef)], 'check', f.work) };
}
function objects(value) {
  if (!value || typeof value !== 'object') return [];
  return [value, ...Object.values(value).flatMap(objects)];
}
export function retained(result, record) {
  const all = objects(result.value);
  assert.ok(all.some((item) => isDeepStrictEqual(item, record)), 'original old record/tuple/verdict must remain intact in reviewer context');
  const metadata = all.find((item) => item.applicability === 'noncurrent' && isDeepStrictEqual(item.source, oldRef) && item.pr === record.pr);
  assert.ok(metadata, 'retained work-record history needs explicit noncurrent source identity');
  assert.ok(metadata.findings?.length > 0, 'noncurrent classification must expose its exclusion reason');
  assert.ok(all.some((item) => isDeepStrictEqual(item, dispositionRef)), 'exact disposition source link must remain in raw Evidence context');
}
