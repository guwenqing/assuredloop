// The fixed convention never overrides an explicitly selected native formal tree.
export function isInformalNotePath(file, openspecRoot) {
  if (typeof file !== 'string' || !file.startsWith('.assuredloop/notes/')) return false;
  if (typeof openspecRoot === 'string') {
    const prefix = openspecRoot === '.' ? '' : `${openspecRoot}/`;
    if (file === `${prefix}config.yaml` || ['specs/', 'changes/', 'schemas/'].some((part) => file.startsWith(`${prefix}${part}`))) return false;
  }
  return true;
}
