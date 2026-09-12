import Ajv from 'ajv';
import { readFileSync } from 'node:fs';

const schema = JSON.parse(readFileSync(new URL('../schemas/workflow.schema.json', import.meta.url), 'utf8'));
const ajv = new Ajv({ allErrors: true, strict: false });
ajv.addFormat('utc-timestamp', {
  type: 'string',
  validate(value) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return false;
    const time = Date.parse(value);
    return Number.isFinite(time) && new Date(time).toISOString() === value.replace(/(?<!\.\d{3})Z$/, '.000Z');
  },
});
ajv.addSchema(schema);
const validators = new Map();

export const hasReviewDeclarations = (record) => record && typeof record === 'object' &&
  ['producer_session', 'reviewer_session', 'reviewer_model', 'review_depth'].some((field) => Object.hasOwn(record, field));

export function validateRecord(kind, value) {
  if (!Object.hasOwn(schema.$defs, kind)) {
    return { valid: false, errors: [{ message: `Unsupported record kind: ${kind}` }] };
  }
  if (!validators.has(kind)) {
    validators.set(kind, ajv.compile({ $ref: `${schema.$id}#/$defs/${kind}` }));
  }
  const validate = validators.get(kind);
  const valid = validate(value);
  const errors = valid ? [] : structuredClone(validate.errors);
  if (kind === 'config') {
    const labels = value?.repository?.labels;
    if (labels && Object.hasOwn(labels, 'discipline')) errors.push({
      instancePath: '/repository/labels/discipline',
      message: 'Remove repository.labels.discipline and migrate the six repository.labels.type mappings, including architecture-task; reconcile Issue categories against their activities before removing obsolete labels.',
    });
    const seen = new Map();
    for (const [category, label] of Object.entries(labels?.type || {})) {
      if (typeof label !== 'string') continue;
      const normalized = label.toLowerCase();
      if (seen.has(normalized)) errors.push({ instancePath: `/repository/labels/type/${category}`,
        message: `Category label conflicts with ${seen.get(normalized)} under case-insensitive matching.` });
      seen.set(normalized, category);
    }
  }
  return { valid: errors.length === 0, errors };
}

export function collectRecordReferences(value) {
  const result = new Map();
  const add = (ref) => result.set(JSON.stringify(ref), structuredClone(ref));
  function visit(node, item) {
    if (item === undefined || item === null || !node) return;
    if (node.$ref) {
      const name = node.$ref.split('/').at(-1);
      if (name === 'source' && validateRecord('source', item).valid) {
        add(item.kind === 'git-blob' ? item.ref : { repository: item.repository, comment_id: item.comment_id });
        return;
      }
      if (['work', 'repoRef', 'commentRef', 'evidenceRef', 'planRef'].includes(name)) {
        if (validateRecord(name, item).valid) {
          if (name === 'planRef') { const { items, ...ref } = item; add(ref); }
          else add(item);
        }
        return;
      }
      visit(schema.$defs[name], item);
      return;
    }
    for (const variant of [...(node.anyOf || []), ...(node.oneOf || []), ...(node.allOf || [])]) visit(variant, item);
    if (Array.isArray(item)) for (const entry of item) visit(node.items, entry);
    else if (typeof item === 'object') for (const [field, shape] of Object.entries(node.properties || {})) visit(shape, item[field]);
  }
  for (const kind of ['issue', 'pr', 'evidence', 'config', 'activation', 'manifest', 'selfChangeDecision', 'initialBootstrapVerification']) {
    if (validateRecord(kind, value).valid) visit(schema.$defs[kind], value);
  }
  return [...result.values()];
}
