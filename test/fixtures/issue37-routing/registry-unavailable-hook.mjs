import { registerHooks } from 'node:module';

// Simulate only the existing registry read boundary. Other native APIs,
// Markdown parsing, schemas and executable runtime inputs remain usable.
registerHooks({
  load(url, context, nextLoad) {
    const loaded = nextLoad(url, context);
    if (url.endsWith('/src/native.js')) {
      const source = Buffer.isBuffer(loaded.source) ? loaded.source.toString('utf8') : loaded.source;
      const needle = 'export async function nativeTools() {';
      if (typeof source !== 'string' || !source.includes(needle)) throw new Error('Existing nativeTools fixture boundary unavailable');
      return { ...loaded, source: source.replace(needle, `${needle}\n  throw Object.assign(new Error('Pinned native registry unavailable in isolated fixture'), { code: 'compatibility-error' });`) };
    }
    return loaded;
  },
});
