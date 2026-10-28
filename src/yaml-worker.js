// A worker thread of parseRecords (yaml-once.js): it parses its share of the
// record texts with yaml, as parseOnce does, and gives back each value. A
// text whose parse gives a warning or an error, or whose value is not plain
// data, gives undefined, and the main thread parses it when a reader asks.
import { parentPort, workerData } from 'node:worker_threads';
import { parseDocument } from 'yaml';

const plain = (v) => v === null || ['string', 'number', 'boolean'].includes(typeof v)
  || (Array.isArray(v) ? v.every(plain) : typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype && Object.values(v).every(plain));

parentPort.postMessage(workerData.map((text) => {
  const doc = parseDocument(text);
  if (doc.warnings.length || doc.errors.length) return undefined;
  const value = doc.toJS();
  return plain(value) ? value : undefined;
}));
