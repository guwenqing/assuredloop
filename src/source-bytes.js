import { fail } from './files.js';
import { validateRecord } from './records.js';

export async function sourceBytes(adapter, source) {
  const shape = validateRecord('source', source);
  if (!shape.valid) fail('source-invalid', 'Invalid fixity source descriptor.', shape.errors);
  if (source.kind === 'git-blob') {
    const bytes = await adapter.readBlob(source.ref);
    if (!Buffer.isBuffer(bytes)) fail('evidence-unavailable', 'Raw Git blob bytes are unavailable.');
    return bytes;
  }
  const value = await adapter.readComment({ repository: source.repository, comment_id: source.comment_id });
  if (value?.id !== source.comment_id || typeof value?.body !== 'string') fail('evidence-unavailable', 'The declared comment identity/body representation is unavailable.');
  return Buffer.from(value.body, 'utf8');
}
