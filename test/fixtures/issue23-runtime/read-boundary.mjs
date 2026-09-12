import fs from 'node:fs';
import promises from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const original = promises.readFile;
const contractRoot = fs.realpathSync(process.env.ISSUE23_CONTRACT_ROOT);
promises.readFile = async function (value, ...args) {
  const filename = value instanceof URL ? fileURLToPath(value) : typeof value === 'string' ? path.resolve(value) : null;
  if (filename && fs.realpathSync(filename).startsWith(`${contractRoot}${path.sep}`) && filename.endsWith('.md')) {
    fs.appendFileSync(process.env.ISSUE23_AUDIT_LOG, `${JSON.stringify({ operation: 'readFile', filename })}\n`);
    throw Object.assign(new Error('Independent sentinel: packaged contract integrity bytes were read.'), { code: 'ISSUE23_SELF_CHECK_READ' });
  }
  return original.call(this, value, ...args);
};
syncBuiltinESMExports();

const childProcess = (await import('node:child_process')).default;
const { promisify } = await import('node:util');
const originalExecFile = childProcess.execFile;
const originalAsyncExecFile = promisify(originalExecFile);
function observeCommand(command, args) {
  fs.appendFileSync(process.env.ISSUE23_AUDIT_LOG.replace('reads.jsonl', 'commands.jsonl'), `${JSON.stringify({ command, args })}\n`);
}
childProcess.execFile = function (command, args, ...rest) {
  observeCommand(command, args);
  return originalExecFile.call(this, command, args, ...rest);
};
// Node's custom promisifier calls the original function directly, so instrument
// that entry separately while retaining its native stdout/stderr result shape.
childProcess.execFile[promisify.custom] = function (command, args, ...rest) {
  observeCommand(command, args);
  return originalAsyncExecFile(command, args, ...rest);
};
syncBuiltinESMExports();
