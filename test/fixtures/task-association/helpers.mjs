export const repository = 'example/consumer';
export const otherRepository = 'example/other-consumer';
export const revision = '0123456789abcdef0123456789abcdef01234567';
export const workIssue = `${repository}#8`;
export const otherWorkIssue = `${repository}#9`;
export const neighboringWorkIssue = `${repository}#7`;
export const foreignWorkIssue = `${otherRepository}#8`;

export function planRef(items = ['3.1'], overrides = {}) {
  return {
    repository,
    revision,
    path: 'openspec/changes/workflow-refresh/tasks.md',
    items,
    ...overrides,
  };
}

export function issueLink(number, { owner = 'example', repo = 'consumer', host = 'github.com' } = {}) {
  return `https://${host}/${owner}/${repo}/issues/${number}`;
}

export function workIssueLine(number, options = {}) {
  const label = options.label ?? `#${number}`;
  return `Work Issue: [${label}](${issueLink(number, options)})`;
}

export const packageHeader = `## 3. Read-only trace checks\n\n${workIssueLine(8)}\n`;

export const matchingPackageTasks = `${packageHeader}
### 3.1 Read-only adapters

- [ ] 3.1 Read the bound repository without writes

### 3.2 Record checks

- [ ] 3.2 Validate the work record
`;

export const taskOnlyAssociation = `## 3. Read-only trace checks

### 3.1 Read-only adapters

${workIssueLine(8)}

- [ ] 3.1 Read the bound repository without writes
`;

export const inlineTaskAssociation = `## 3. Read-only trace checks

### 3.1 Read-only adapters

- [ ] 3.1 Read the bound repository without writes. Work Issue: [#8](${issueLink(8)})
`;

export const inlineCodeExampleWithPackageOwner = `## 3. Read-only trace checks

${workIssueLine(8)}

### 3.1 Read-only adapters

- [ ] 3.1 Read the bound repository and document \`Work Issue: [#9](${issueLink(9)})\` as an example
`;

export const duplicateTaskIdAcrossPackages = `## 3. First package

${workIssueLine(8)}

### 3.1 First implementation

- [ ] 3.1 First package implementation

## 4. Second package

${workIssueLine(9)}

### 3.1 Second implementation

- [ ] 3.1 Second package implementation
`;

export const mismatchedPackage = `## 3. Read-only trace checks

${workIssueLine(9)}

### 3.1 Read-only adapters

- [ ] 3.1 Read the bound repository without writes
`;

export const ambiguousPackage = `## 3. Read-only trace checks

${workIssueLine(8)}
${workIssueLine(9)}

### 3.1 Read-only adapters

- [ ] 3.1 Read the bound repository without writes
`;

export const conflictingTaskAndPackage = `## 3. Read-only trace checks

${workIssueLine(8)}

### 3.1 Read-only adapters

${workIssueLine(9)}

- [ ] 3.1 Read the bound repository without writes
`;

export const fencedAndProseLinks = `# Workflow refresh tasks

Basis: https://github.com/example/consumer/issues/77
Depends on https://github.com/example/consumer/issues/66

\`\`\`markdown
## Example package
Work Issue: [#999](https://github.com/example/consumer/issues/999)
### 9.9 Example task
Work Issue: [#999](https://github.com/example/consumer/issues/999)
- [ ] 9.9 This is only a documentation example
\`\`\`

${packageHeader}
### 3.1 Read-only adapters

- [ ] 3.1 Read the bound repository without writes
`;

export const sectionBoundary = `## 2. Earlier package

${workIssueLine(7)}

### 2.1 Earlier task

- [ ] 2.1 Previous package work

## 3. Read-only trace checks

${workIssueLine(8)}

### 3.1 Read-only adapters

- [ ] 3.1 Current package work
`;

export const unsupportedAssociationLabel = `## 3. Read-only trace checks

### 3.1 Read-only adapters

Owner Issue: [#8](${issueLink(8)})

- [ ] 3.1 Current package work
`;

export const foreignHostAssociation = `## 3. Read-only trace checks

${workIssueLine(8, { host: 'evil.invalid' })}

### 3.1 Read-only adapters

- [ ] 3.1 Current package work
`;

export const foreignRepositoryAssociation = `## 3. Read-only trace checks

Work Issue: [other](https://github.com/example/other-consumer/issues/8)

### 3.1 Read-only adapters

- [ ] 3.1 Current package work
`;

export const missingTask = `## 3. Read-only trace checks

${workIssueLine(8)}

### 3.1 Read-only adapters

- [ ] 3.1 Current package work
`;

export const unresolvedTaskAssociation = `## 3. Read-only trace checks

### 3.1 Read-only adapters

- [ ] 3.1 The package owner has not yet been declared
`;

export const earlyPlanningWithoutPlan = `# Early intake

The owner has not selected an applicable native plan yet.

Issue links in this prose are data: https://github.com/example/consumer/issues/88
`;

export function withTaskAssociation(content, number) {
  return content.replace(
    '- [ ] 3.1 Read the bound repository without writes',
    `${workIssueLine(number)}\n\n- [ ] 3.1 Read the bound repository without writes`,
  );
}
