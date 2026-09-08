import { validateRecord } from './records.js';
import { loadNativeRuntime } from './native-runtime.js';
import { maskCodeSpans } from './markdown.js';

const normalizeWork = (work) => work.toLowerCase();

function declarations(text, inline = false) {
  const owners = [];
  const pattern = inline ? /\bWork Issue:\s*/g : /^ {0,3}Work Issue:\s*/gm;
  for (const marker of text.matchAll(pattern)) {
    const value = text.slice(marker.index + marker[0].length).split('\n')[0];
    const link = /^\[[^\]\n]+\]\(https:\/\/github\.com\/([^/?#\s]+\/[^/?#\s]+)\/issues\/([1-9]\d*)\)/.exec(value);
    const work = link && `${link[1]}#${link[2]}`;
    if (!work || !validateRecord('work', work).valid) owners.push(null);
    else {
      owners.push(normalizeWork(work));
      if (/^\s*(?:,|and\b|\[)/.test(value.slice(link[0].length))) owners.push(null);
    }
  }
  return owners;
}

export async function checkTaskAssociations({ content, planRef, allowedWorks = [], allowUnresolved = false } = {}) {
  const result = { status: 'valid', findings: [], associations: [] };
  if (planRef == null) return result;
  const add = (code, message, unresolved = false) => {
    const severity = unresolved && allowUnresolved ? 'review' : unresolved ? 'unavailable' : 'error';
    result.findings.push({ code, message, severity });
    if (severity === 'error') result.status = 'invalid';
    else if (severity === 'unavailable' && result.status !== 'invalid') result.status = 'unavailable';
  };
  if (typeof content !== 'string' || !validateRecord('planRef', planRef).valid || !Array.isArray(allowedWorks) || allowedWorks.some((work) => !validateRecord('work', work).valid)) {
    add('task-association-input-invalid', 'Task association requires a fixed PlanRef, source text and qualified work mappings.');
    return result;
  }
  const allowed = new Set(allowedWorks.map(normalizeWork));
  const native = await loadNativeRuntime();
  const tasks = new Map();
  const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/);
  const mask = native.buildCodeFenceMask(lines);
  const firstHeader = lines.findIndex((line, index) => !mask[index] && /^(#{1,6})\s+/.test(line));
  const sections = new native.MarkdownParser(content).parseSections();
  function visit(section, inherited) {
    const sourceLines = section.content.split('\n');
    const fenced = native.buildCodeFenceMask(sourceLines);
    const direct = [];
    for (let index = 0; index < sourceLines.length; index++) {
      if (fenced[index]) { direct.push(''); continue; }
      if (/^(#{1,6})\s+/.test(sourceLines[index])) break;
      direct.push(sourceLines[index]);
    }
    const text = maskCodeSpans(direct.join('\n'));
    const owners = [...inherited, ...declarations(text)];
    for (const task of native.parseTaskLines(text)) {
      const id = /^(\d+(?:\.\d+)*)(?:\.)?(?=\s|$)/.exec(task.description)?.[1];
      if (!id) continue;
      const entry = { owners: [...owners, ...declarations(task.description, true)], description: task.description };
      if (!tasks.has(id)) tasks.set(id, []);
      tasks.get(id).push(entry);
    }
    for (const child of section.children || []) visit(child, owners);
  }
  visit({ content: lines.slice(0, firstHeader < 0 ? lines.length : firstHeader).join('\n'), children: sections }, []);
  for (const item of planRef.items) {
    const matches = tasks.get(item) || [];
    if (!matches.length) { add('plan-item-missing', `Native task ${item} does not exist outside fenced examples in this PlanRef.`); continue; }
    const owners = [...new Set(matches.flatMap((entry) => entry.owners))];
    result.associations.push({ item, owners: owners.filter(Boolean), verified: matches.length === 1 && owners.length === 1 && owners[0] !== null && allowed.has(owners[0]) });
    if (matches.length !== 1 || owners.length !== 1 || owners[0] === null) {
      add('task-association-unresolved', `Task ${item} has missing, unrecognized, ambiguous or conflicting Work Issue declarations.`, true);
    } else if (!allowed.has(owners[0])) add('task-assignment-mismatch', `Canonical task ${item} belongs to ${owners[0]}, outside the contributing work mapping.`);
  }
  return result;
}
