export function maskCodeSpans(text) {
  const runs = [...text.matchAll(/`+/g)];
  const spans = [];
  for (let index = 0; index < runs.length; index++) {
    const opening = runs[index];
    const preceding = /\\+$/.exec(text.slice(0, opening.index));
    if (preceding && preceding[0].length % 2) continue;
    const end = runs.findIndex((run, next) => next > index && run[0].length === opening[0].length);
    if (end !== -1) {
      spans.push([opening.index, runs[end].index + runs[end][0].length]);
      index = end;
    }
  }
  for (const [start, end] of spans.reverse()) text = `${text.slice(0, start)}${text.slice(start, end).replace(/[^\n]/g, ' ')}${text.slice(end)}`;
  return text;
}
