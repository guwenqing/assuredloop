import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fail, git, optionalRead, relativePath, repositoryIdentity, repositoryRoot, safePath } from './files.js';
import { validateRecord } from './records.js';

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

export async function generateContracts({ sourceRoot, sourceRef, outputRoot, packageName, packageVersion, basis }) {
  relativePath(sourceRef?.path);
  if (!validateRecord('repoRef', sourceRef).valid || !['bootstrap', 'canonical'].includes(basis) ||
      typeof outputRoot !== 'string' || !path.isAbsolute(outputRoot)) {
    fail('binding-invalid', 'Generation needs an explicit source RepoRef, absolute output directory and bootstrap/canonical basis.');
  }
  const root = await repositoryRoot(sourceRoot);
  const remotes = (await git(root, ['remote'])).split('\n');
  if (remotes.includes('origin')) {
    const origin = await git(root, ['remote', 'get-url', 'origin']);
    if (repositoryIdentity(origin) !== sourceRef.repository.toLowerCase()) {
      fail('binding-invalid', 'Declared source repository does not match the checkout origin.');
    }
  }
  // Without origin, the explicit root/RepoRef pair is caller-declared provenance.
  // Even a matching origin string checks consistency, not repository ownership.
  const selectedCommit = await git(root, ['rev-parse', '--verify', `${sourceRef.revision}^{commit}`]);
  if (selectedCommit !== sourceRef.revision) fail('binding-invalid', 'Source must identify the full commit.');
  const prefix = sourceRef.path === '.' ? '' : `${sourceRef.path}/`;
  const tree = await git(root, ['ls-tree', '-r', '-z', sourceRef.revision, '--', sourceRef.path], { binary: true });
  const assets = [];
  for (const entry of tree.toString('utf8').split('\0').filter(Boolean)) {
    const tab = entry.indexOf('\t');
    const [mode, type, hash] = entry.slice(0, tab).split(' ');
    const sourcePath = entry.slice(tab + 1);
    if (!sourcePath.startsWith(prefix)) fail('path-unsafe', 'Git returned an out-of-scope source path.');
    if (mode === '120000' || type !== 'blob') fail('path-unsafe', `Linked or unsupported source: ${sourcePath}`);
    if (!sourcePath.endsWith('.md')) continue;
    const destination = relativePath(sourcePath.slice(prefix.length));
    const bytes = await git(root, ['cat-file', 'blob', hash], { binary: true });
    assets.push({ path: destination, bytes, sha256: digest(bytes) });
  }
  assets.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  if (!assets.length) fail('contract-invalid', 'Selected source contains no Markdown contracts.');
  const metadata = { schema_version: 1, name: packageName, version: packageVersion, basis,
    source_ref: sourceRef, contracts_path: 'contracts', files: assets.map(({ path: file, sha256 }) => ({ path: file, sha256 })) };
  const declaration = { name: packageName, version: packageVersion, integrity: `sha512-${Buffer.alloc(64).toString('base64')}`, source_ref: sourceRef, contracts_path: 'contracts' };
  if (!validateRecord('contractPackage', declaration).valid) fail('binding-invalid', 'Invalid package name/version.');
  // Plan every existing-file conflict before writing any output.
  const parent = path.dirname(outputRoot);
  await mkdir(parent, { recursive: true });
  const safeOutput = await safePath(parent, path.basename(outputRoot));
  await mkdir(safeOutput, { recursive: true });
  const files = [...assets.map(({ path: file, bytes }) => ({ path: file, bytes })),
    { path: 'metadata.json', bytes: Buffer.from(`${JSON.stringify(metadata, null, 2)}\n`) }];
  const expected = new Set(files.map((file) => file.path));
  async function checkInventory(relative = '') {
    const directory = relative ? await safePath(safeOutput, relative) : safeOutput;
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await checkInventory(name);
      else if (!entry.isFile() || !expected.has(name)) fail('file-conflict', `Unlisted or linked contract output: ${name}`);
    }
  }
  await checkInventory();
  for (const file of files) {
    const destination = await safePath(safeOutput, file.path);
    try {
      if (!(await readFile(destination)).equals(file.bytes)) fail('file-conflict', `Contract output differs: ${file.path}`);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  for (const file of files) {
    const destination = await safePath(safeOutput, file.path);
    await mkdir(path.dirname(destination), { recursive: true });
    if (await optionalRead(destination) === null) await writeFile(destination, file.bytes, { flag: 'wx' });
    else if (!(await readFile(destination)).equals(file.bytes)) fail('file-conflict', `Contract output changed during generation: ${file.path}`);
  }
  return metadata;
}

export async function verifyContracts(packageRoot) {
  try {
    const metadataPath = await safePath(packageRoot, 'contracts/metadata.json');
    const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
    if (metadata.schema_version !== 1 || !['bootstrap', 'canonical'].includes(metadata.basis) ||
        metadata.contracts_path !== 'contracts' || !validateRecord('repoRef', metadata.source_ref).valid ||
        typeof metadata.name !== 'string' || typeof metadata.version !== 'string' ||
        !Array.isArray(metadata.files) || metadata.files.length === 0) fail('contract-invalid', 'Malformed contract metadata.');
    const expected = new Set(['metadata.json']);
    for (const file of metadata.files) {
      relativePath(file.path);
      if (!file.path.endsWith('.md') || !/^[a-f0-9]{64}$/.test(file.sha256) || expected.has(file.path)) {
        fail('contract-invalid', 'Invalid or duplicate contract asset descriptor.');
      }
      expected.add(file.path);
      const bytes = await readFile(await safePath(packageRoot, `contracts/${file.path}`));
      if (digest(bytes) !== file.sha256) fail('contract-invalid', `Contract bytes differ: ${file.path}`);
    }
    async function inventory(relative) {
      for (const entry of await readdir(await safePath(packageRoot, `contracts/${relative}`.replace(/\/$/, '')), { withFileTypes: true })) {
        const next = relative ? `${relative}/${entry.name}` : entry.name;
        if (entry.isDirectory()) await inventory(next);
        else if (!entry.isFile() || !expected.has(next)) fail('contract-invalid', `Unlisted or linked contract asset: ${next}`);
      }
    }
    await inventory('');
    return metadata;
  } catch (error) {
    if (error.code === 'contract-invalid') throw error;
    fail('contract-invalid', `Contract assets unavailable or malformed: ${error.message}`);
  }
}
