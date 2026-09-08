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

export function validateRecord(kind, value) {
  if (!Object.hasOwn(schema.$defs, kind)) {
    return { valid: false, errors: [{ message: `Unsupported record kind: ${kind}` }] };
  }
  if (!validators.has(kind)) {
    validators.set(kind, ajv.compile({ $ref: `${schema.$id}#/$defs/${kind}` }));
  }
  const validate = validators.get(kind);
  const valid = validate(value);
  return { valid, errors: valid ? [] : structuredClone(validate.errors) };
}
