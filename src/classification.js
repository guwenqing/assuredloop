const activities = {
  request: ['triage'],
  epic: [],
  'architecture-task': ['plan', 'closeout'],
  task: ['adopt', 'deliver', 'review'],
  bug: ['deliver'],
  spike: ['research'],
};

export function classifyIssue(issue, record, mapping, provenance = {}) {
  const labels = (Array.isArray(issue.labels) ? issue.labels : []).map((label) => typeof label === 'string' ? label : label?.name).filter((label) => typeof label === 'string');
  const result = { labels, category: null, activity: record?.activity ?? null,
    rule: { activities: [], basis: 'contracts/github-work-traceability/spec.md#requirement-work-categories-and-activities-are-formally-consistent' },
    discrepancies: [], exception: null, ...provenance };
  const add = (code, message, severity = 'error') => result.discrepancies.push({ code, message, severity });
  const mapped = Object.keys(activities).map((category) => mapping?.[category]);
  if (mapped.some((label) => typeof label !== 'string' || !label.trim()) ||
      new Set(mapped.map((label) => label.toLowerCase())).size !== mapped.length) {
    add('category-config-unavailable', 'Classification requires six explicit, nonempty, case-insensitively distinct consumer category mappings.', 'unavailable');
    return result;
  }
  const names = new Set(labels.map((label) => label.toLowerCase()));
  const categories = Object.keys(activities).filter((category) => names.has(mapping[category].toLowerCase()));
  if (categories.length === 1) {
    result.category = categories[0];
    result.rule.activities = [...activities[result.category]];
  }
  if (categories.length > 1) add('category-multiple', `Issue declares multiple configured categories: ${categories.join(', ')}.`);
  if (!record && categories.length <= 1) {
    if (result.category === 'epic') result.exception = 'epic-container';
    else if (issue.state === 'open' && (!result.category || result.category === 'request')) result.exception = 'rough-request';
    else add('record-context-required', 'This Issue category requires an authoritative Workflow context record.');
  } else if (record) {
    if (!categories.length) add('category-missing', 'Routed Issue must declare exactly one configured category label.');
    else if (categories.length === 1 && !activities[result.category].includes(result.activity)) {
      add('category-activity-incompatible', `${result.category} is incompatible with activity ${result.activity ?? '(missing)'}; ${result.category === 'epic' ? 'Epic is a non-executable container.' : `permitted activities: ${activities[result.category].join(', ')}.`}`);
    }
  }
  return result;
}
