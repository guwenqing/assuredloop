import { fail } from './files.js';
import { loadNativeRuntime } from './native-runtime.js';

export async function readRecordBody(body, { allowPlain = false } = {}) {
  if (typeof body !== 'string') fail('record-context-invalid', 'Record body must be text.');
  let plainError;
  if (allowPlain) {
    try { return JSON.parse(body); } catch (error) { plainError = error; }
  }
  const { MarkdownParser } = await loadNativeRuntime();
  const contexts = [];
  function visit(sections) {
    for (const section of sections) {
      if (section.level === 2 && section.title === 'Workflow context') contexts.push(section);
      visit(section.children || []);
    }
  }
  visit(new MarkdownParser(body).parseSections());
  if (!contexts.length) fail('record-context-missing', plainError && /^[\s]*[\[{]/.test(body)
    ? `Malformed record JSON: ${plainError.message}` : 'Missing authoritative Workflow context block.');
  if (contexts.length !== 1) fail('record-context-invalid', 'Exactly one Workflow context section is permitted.');
  const blocks = [];
  let fence;
  let lines = [];
  for (const line of contexts[0].content.split('\n')) {
    if (!fence) {
      const start = /^ {0,3}(`{3,}|~{3,})([^\r\n]*)$/.exec(line);
      if (start) { fence = { marker: start[1][0], length: start[1].length, language: start[2].trim() }; lines = []; }
    } else if (new RegExp(`^ {0,3}${fence.marker}{${fence.length},}\\s*$`).test(line)) {
      if (fence.language === 'json') blocks.push(lines.join('\n'));
      fence = undefined;
    } else lines.push(line);
  }
  if (fence || blocks.length !== 1) fail('record-context-invalid', 'Exactly one complete fenced JSON record is required under Workflow context.');
  try { return JSON.parse(blocks[0]); }
  catch (error) { fail('record-context-invalid', `Malformed record JSON: ${error.message}`); }
}
