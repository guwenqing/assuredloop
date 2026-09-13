// Read-only transport optimization for the final freshness snapshot. The normal
// REST reader remains the fallback for unsupported or incomplete responses.
const quote = JSON.stringify;
const ownerFields = 'number repository { nameWithOwner }';
const commentFields = 'id fullDatabaseId body';
const commentConnection = `comments(first:100) { totalCount pageInfo { hasNextPage } nodes { ${commentFields} } }`;
const pullFields = `${ownerFields} body state merged mergedAt mergeCommit { oid } potentialMergeCommit { oid }
  changedFiles headRefOid headRefName headRepository { nameWithOwner } baseRefOid baseRefName`;
const commentId = value => /^\d+$/.test(String(value)) && Number.isSafeInteger(Number(value)) ? Number(value) : null;
const repository = (value, expected) => value?.repository?.nameWithOwner?.toLowerCase() === expected;
const sha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);

function selector(item) {
  const { normalized: name, resource, value } = item;
  const pull = /^pulls\/(\d+)$/.exec(resource);
  if (pull && value?.node_id) return {
    field: `node(id:${quote(value.node_id)}) { ... on PullRequest { ${pullFields} } }`,
    convert(node) {
      if (!repository(node, name) || node.number !== Number(pull[1]) || typeof node.body !== 'string' || !node.body ||
          typeof node.merged !== 'boolean' || !['OPEN', 'CLOSED', 'MERGED'].includes(node.state) ||
          !Number.isSafeInteger(node.changedFiles) || !sha(node.headRefOid) || !sha(node.baseRefOid) ||
          typeof node.headRefName !== 'string' || typeof node.baseRefName !== 'string') return;
      // REST may retain a historical test-merge SHA on an unmerged closed PR,
      // and represents absent bodies differently. Keep REST for those cases.
      if (node.state === 'CLOSED' && !node.merged) return;
      const merge = (node.merged ? node.mergeCommit : node.potentialMergeCommit)?.oid ?? null;
      if (merge !== null && !sha(merge)) return;
      if (node.merged && (!merge || !Number.isFinite(Date.parse(node.mergedAt)))) return;
      return { number: node.number, body: node.body, state: node.state === 'OPEN' ? 'open' : 'closed',
        merged: node.merged, merged_at: node.mergedAt, merge_commit_sha: merge, changed_files: node.changedFiles,
        head: { sha: node.headRefOid, ref: node.headRefName, repo: node.headRepository && { full_name: node.headRepository.nameWithOwner } },
        base: { sha: node.baseRefOid, ref: node.baseRefName, repo: { full_name: node.repository.nameWithOwner } } };
    },
  };
  const comment = /^issues\/comments\/(\d+)$/.exec(resource);
  if (comment && value?.node_id) return {
    field: `node(id:${quote(value.node_id)}) { ... on IssueComment { ${commentFields} repository { nameWithOwner } } }`,
    convert(node) {
      if (!repository(node, name) || commentId(node.fullDatabaseId) !== Number(comment[1]) || typeof node.body !== 'string') return;
      return { id: Number(comment[1]), node_id: node.id, body: node.body };
    },
  };
  const comments = /^issues\/(\d+)\/comments$/.exec(resource);
  if (comments && item.paginate) {
    const [owner, repo] = name.split('/');
    return {
      field: `repository(owner:${quote(owner)},name:${quote(repo)}) {
        issueOrPullRequest(number:${comments[1]}) {
          ... on Issue { ${ownerFields} ${commentConnection} }
          ... on PullRequest { ${ownerFields} ${commentConnection} }
        }
      }`,
      convert(data) {
        const node = data?.issueOrPullRequest;
        const connection = node?.comments;
        if (!repository(node, name) || node.number !== Number(comments[1]) || !Array.isArray(connection?.nodes) ||
            connection.pageInfo?.hasNextPage !== false || connection.nodes.length !== connection.totalCount) return;
        if (connection.nodes.some(c => !commentId(c?.fullDatabaseId) || typeof c.body !== 'string')) return;
        const ids = connection.nodes.map(c => commentId(c.fullDatabaseId));
        if (new Set(ids).size !== ids.length) return;
        return connection.nodes.map(c => ({ id: commentId(c.fullDatabaseId), node_id: c.id, body: c.body,
          issue_url: `https://api.github.com/repos/${name}/issues/${comments[1]}` }));
      },
    };
  }
}

export async function readSnapshotBatch(observations, request) {
  // Native node IDs establish that the source supports GitHub's node lookup.
  // Do not synthesize IDs from database IDs, or change other read adapters.
  if (!observations.some(item => item.value?.node_id)) return [];
  const inventories = new Set(observations.filter(item => /^issues\/\d+\/comments$/.test(item.resource))
    .map(item => `https://api.github.com/repos/${item.normalized}/${item.resource.slice(0, -'/comments'.length)}`));
  const timelines = new Set(observations.filter(item => /^issues\/\d+\/timeline$/.test(item.resource))
    .map(item => `${item.normalized}/${item.resource.slice(0, -'/timeline'.length)}`));
  const selected = observations.filter(item => {
    if (/^issues\/comments\/\d+$/.test(item.resource) && inventories.has(item.value?.issue_url?.toLowerCase())) return false;
    if (/^issues\/\d+\/comments$/.test(item.resource) && timelines.has(`${item.normalized}/${item.resource.slice(0, -'/comments'.length)}`)) return false;
    return true;
  }).map(item => ({ item, read: selector(item) })).filter(entry => entry.read);
  const result = [];
  // Bound one transport query, not the inventory: every remaining entry is
  // processed in a subsequent batch or by the complete REST fallback.
  for (let start = 0; start < selected.length; start += 40) {
    const batch = selected.slice(start, start + 40);
    let response;
    try { response = await request(`query { ${batch.map((entry, i) => `r${i}:${entry.read.field}`).join('\n')} }`); }
    catch { continue; }
    // Partial GraphQL success is not complete evidence. Fall back rather than
    // turning errors, missing nodes, or pagination into an empty source.
    if (!response?.data || response.errors?.length) continue;
    for (let i = 0; i < batch.length; i++) {
      const value = batch[i].read.convert(response.data[`r${i}`]);
      if (value !== undefined) result.push({ ...batch[i].item, value });
    }
  }
  return result;
}
