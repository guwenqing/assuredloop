import { readFile } from 'node:fs/promises';

import { loadNativeRuntime } from '../../../src/native-runtime.js';
import { basisPath, basisSource, frameworkRepository, revision, taskRevisionFor, taskSource, taskSourceFor, tasksPath } from './common.mjs';
import caseA from './case-a.mjs';
import caseB from './case-b.mjs';

export { caseA, caseB };
export { basisPath, basisSource, frameworkRepository, revision, taskRevisionFor, taskSource, taskSourceFor, tasksPath } from './common.mjs';

function sourceKey(ref) {
  return JSON.stringify([ref.repository.toLowerCase(), ref.revision, ref.path, ref.anchor ?? null]);
}

export function sourceBytes(issueNumber = 201) {
  return new Map([
    [sourceKey({ repository: frameworkRepository, revision, path: basisPath, anchor: 'trace-destination' }), Buffer.from(basisSource, 'utf8')],
    [sourceKey({ repository: frameworkRepository, revision: taskRevisionFor(issueNumber), path: tasksPath }), Buffer.from(taskSourceFor(issueNumber), 'utf8')],
  ]);
}

export function createSourceResolver(issueNumber = 201) {
  const bytesByRef = sourceBytes(issueNumber);
  const calls = [];
  return {
    calls,
    async resolveRef(ref) {
      calls.push(structuredClone(ref));
      const bytes = bytesByRef.get(sourceKey(ref));
      if (!bytes) {
        const error = new Error(`semantic-delivery source is unavailable: ${ref.path}`);
        error.code = 'record-unavailable';
        error.details = { reason: 'path-missing' };
        throw error;
      }
      return { content: Buffer.from(bytes).toString('utf8'), bytes: Buffer.from(bytes) };
    },
  };
}

export async function readFixture(name) {
  const module = await import(new URL(`./${name}.mjs`, import.meta.url));
  return structuredClone(module.default ?? module.value);
}

export async function nativeTaskDescriptions() {
  const native = await loadNativeRuntime();
  return native.parseTaskLines(taskSource).map((task) => task.description);
}
