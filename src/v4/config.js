// v4 settings (design.md 2, schema.md 7): `.assuredloop/config.yaml` (the spec
// root, the docs and their ID prefixes) and `.assuredloop/schema.yaml` (the
// kinds, with a version). Both are optional: an absent file gives the defaults.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isSeq, parse, parseDocument } from 'yaml';
import { KINDS, LINK_WORDS } from './markers.js';
import { symlinkOn } from './scope.js';

export const SCHEMA_VERSION = 'assuredloop/1';
const DIR = '.assuredloop';

function read(top, name) {
  const link = symlinkOn(top, `${DIR}/${name}`);
  if (link) throw new Error(`${DIR}/${name} is reached through the symlink ${link}; nothing was read`);
  const path = join(top, DIR, name);
  if (!existsSync(path)) return null;
  try {
    return parse(readFileSync(path, 'utf8')) ?? {};
  } catch (e) {
    throw new Error(`${DIR}/${name}: not valid YAML: ${e.message.split('\n')[0]}`);
  }
}

export function loadConfig(top) {
  const c = read(top, 'config.yaml') ?? {};
  if (typeof c !== 'object' || Array.isArray(c)) throw new Error(`${DIR}/config.yaml: give a mapping of settings`);
  return { ...c, root: c.root ?? 'specs', docs: Array.isArray(c.docs) ? c.docs : [] };
}

export function loadSchema(top) {
  const s = read(top, 'schema.yaml') ?? {};
  if (typeof s !== 'object' || Array.isArray(s)) throw new Error(`${DIR}/schema.yaml: give a mapping`);
  return { ...s, schema: s.schema ?? SCHEMA_VERSION, kinds: s.kinds ?? KINDS };
}

const SCHEMA_TEXT = `# The AssuredLoop model (design.md 3, schema.md 4 and 6), with a version.
schema: ${SCHEMA_VERSION}
kinds:
${Object.entries(KINDS).map(([g, ks]) => `  ${g}: [${ks.join(', ')}]`).join('\n')}
# The link words a marker may hold.
links: [${Object.keys(LINK_WORDS).join(', ')}]
`;

// Writes schema.yaml and config.yaml when absent, and lists `file` with its
// prefix in config's docs when `prefix` is given and the file is not listed.
// Comments in an existing config.yaml stay. Returns the paths written.
export function writeSetup(top, file, prefix) {
  const written = [];
  mkdirSync(join(top, DIR), { recursive: true });
  if (!existsSync(join(top, DIR, 'schema.yaml'))) {
    writeFileSync(join(top, DIR, 'schema.yaml'), SCHEMA_TEXT);
    written.push(`${DIR}/schema.yaml`);
  }
  const path = join(top, DIR, 'config.yaml');
  const had = existsSync(path);
  const doc = parseDocument(had ? readFileSync(path, 'utf8') : `# AssuredLoop settings (design.md 2, schema.md 7).\nschema: ${SCHEMA_VERSION}\nroot: specs\ndocs: []\n`);
  const docs = doc.get('docs');
  const listed = docs?.items?.some((d) => d.get?.('file') === file);
  if (prefix && !listed) {
    const entry = doc.createNode({ file, prefix });
    entry.flow = true;
    if (isSeq(docs)) {
      docs.flow = false;
      docs.add(entry);
    } else {
      doc.set('docs', doc.createNode([entry]));
    }
  }
  if (!had || (prefix && !listed)) {
    writeFileSync(path, doc.toString());
    written.push(`${DIR}/config.yaml`);
  }
  return written;
}
