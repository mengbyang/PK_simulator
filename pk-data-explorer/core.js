/* PK Data Explorer — dependency-free calculation and CSV core. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PKCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function parseCSV(text) {
    text = String(text).replace(/^\uFEFF/, '');
    const result = []; let row = []; let field = ''; let quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"') {
        if (quoted && text[i + 1] === '"') { field += '"'; i++; }
        else if (quoted) quoted = false;
        else if (!field) quoted = true;
        else field += c;
      } else if (c === ',' && !quoted) { row.push(field); field = ''; }
      else if ((c === '\n' || c === '\r') && !quoted) {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); field = '';
        if (row.some(x => String(x).trim() !== '')) result.push(row);
        row = [];
      } else field += c;
    }
    row.push(field);
    if (row.some(x => String(x).trim() !== '')) result.push(row);
    return result;
  }

  function rowsFromMatrix(matrix) {
    if (!matrix || !matrix.length) return { headers: [], rows: [] };
    const seen = new Map();
    const headers = (matrix[0] || []).map((v, i) => {
      const name = String(v == null ? '' : v).trim() || `Column ${i + 1}`;
      const n = (seen.get(name) || 0) + 1; seen.set(name, n);
      return n === 1 ? name : `${name} (${n})`;
    });
    const rows = matrix.slice(1).filter(r => r && r.some(x => String(x == null ? '' : x).trim() !== '')).map(values => {
      const entry = {};
      headers.forEach((h, i) => entry[h] = values[i] == null ? '' : values[i]);
      return entry;
    });
    return { headers, rows };
  }

  function numberOrNull(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (value === null || value === undefined) return null;
    const valueStr = String(value).trim();
    if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(valueStr)) return null;
    const n = Number(valueStr);
    return Number.isFinite(n) ? n : null;
  }
  function label(v) { return v === null || v === undefined || String(v).trim() === '' ? '(blank)' : String(v).trim(); }
  const key = values => JSON.stringify(values);
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  const sortNames = values => [...values].sort((a, b) => collator.compare(a, b));
  const unique = values => [...new Set(values)];
  function numericSort(a, b) { return a - b; }

  function summarize(values) {
    const v = values.map(numberOrNull).filter(x => x !== null);
    const n = v.length;
    if (!n) return { n: 0, mean: null, sd: null, cv: null };
    // Welford's sample-variance algorithm; retains zeros.
    let mean = 0, M2 = 0;
    v.forEach((x, i) => { const delta = x - mean; mean += delta / (i + 1); M2 += delta * (x - mean); });
    const sd = n > 1 ? Math.sqrt(Math.max(0, M2 / (n - 1))) : null;
    const cv = sd !== null && mean !== 0 ? sd / mean * 100 : null;
    return { n, mean, sd, cv };
  }

  function filterRecords(rows, filters) {
    return rows.filter(row => Object.entries(filters || {}).every(([col, excluded]) =>
      !excluded || !excluded.includes(label(row[col]))));
  }
  function buildStats(rows, { timeCol, valueCol, animalCol, groupCols = [] } = {}) {
    const groups = new Map();
    for (const r of rows) {
      const t = numberOrNull(r[timeCol]);
      if (t === null) continue;
      const identifiers = groupCols.map(c => label(r[c]));
      const id = key(identifiers);
      if (!groups.has(id)) groups.set(id, { identifiers, times: new Map() });
      const group = groups.get(id);
      if (!group.times.has(t)) group.times.set(t, []);
      group.times.get(t).push({ animal: animalCol ? label(r[animalCol]) : '', value: numberOrNull(r[valueCol]), raw: r });
    }
    const sorted = [...groups.values()].sort((a, b) => {
      for (let i = 0; i < Math.max(a.identifiers.length, b.identifiers.length); i++) {
        const d = collator.compare(a.identifiers[i] || '', b.identifiers[i] || ''); if (d) return d;
      }
      return 0;
    });
    sorted.forEach(g => { g.sortedTimes = [...g.times.keys()].sort(numericSort); g.summaries = new Map();
      g.sortedTimes.forEach(t => g.summaries.set(t, summarize(g.times.get(t).map(r => r.value)))); });
    return { groups: sorted, times: unique(sorted.flatMap(g => g.sortedTimes)).sort(numericSort) };
  }

  function sigRound(v, sig) {
    if (v == null || !Number.isFinite(v)) return null;
    if (v === 0) return 0;
    return Number(Number(v).toPrecision(sig));
  }
  function formatNumber(value, sig = 3, style = 'decimal') {
    if (value === null || value === undefined || !Number.isFinite(value)) return 'NA';
    sig = Math.max(1, Math.min(12, Number(sig) || 3));
    if (style === 'scientific') return Number(value).toExponential(sig - 1).replace(/e([+-])(\d+)$/, (_, s, p) => `E${s}${p.padStart(2, '0')}`);
    if (value === 0) return '0';
    const rounded = sigRound(value, sig);
    const places = Math.max(0, Math.min(20, sig - 1 - Math.floor(Math.log10(Math.abs(rounded)))));
    return rounded.toFixed(places);
  }
  function csvCell(v) { const s = v == null ? '' : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
  const toCSV = matrix => matrix.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';

  function makeWideTable(stats, { groupCols = [], animalCol = '', rowMode = 'replicate', sig = 3, notation = 'decimal' } = {}) {
    const matrix = [[...groupCols, 'Row', ...stats.times.map(String)]];
    const entries = [];
    for (const group of stats.groups) {
      const firstRow = matrix.length;
      const assignments = new Map();
      const times = stats.times;
      if (rowMode === 'animal' && animalCol) {
        const animals = sortNames(unique([...group.times.values()].flat().map(r => r.animal)));
        for (const animal of animals) {
          const row = [...group.identifiers, animal];
          for (const t of times) {
            const matching = (group.times.get(t) || []).filter(x => x.animal === animal);
            row.push(!matching.length ? 'NA' : matching.length === 1 ? formatNumber(matching[0].value, sig, notation) : matching.map(x => formatNumber(x.value, sig, notation)).join('; '));
          }
          matrix.push(row);
        }
      } else {
        const maxReps = Math.max(0, ...[...group.times.values()].map(records => records.length));
        for (let i = 0; i < maxReps; i++) {
          const row = [...group.identifiers, `Individual ${i + 1}`];
          for (const t of times) {
            const records = group.times.get(t) || [];
            const record = [...records].sort((a, b) => collator.compare(a.animal, b.animal))[i];
            row.push(record ? formatNumber(record.value, sig, notation) : 'NA');
          }
          matrix.push(row);
        }
      }
      for (const metric of ['n', 'mean', 'sd', 'cv']) {
        const row = [...group.identifiers, metric === 'cv' ? 'CV%' : metric === 'sd' ? 'SD' : metric === 'mean' ? 'Mean' : 'n'];
        for (const t of times) {
          const s = group.summaries.get(t);
          row.push(!s ? (metric === 'n' ? 0 : 'NA') : metric === 'n' ? s.n : formatNumber(s[metric], sig, notation));
        }
        matrix.push(row);
      }
      entries.push({ firstRow, lastRow: matrix.length - 1, ids: group.identifiers });
    }
    return { matrix, entries };
  }

  return { parseCSV, rowsFromMatrix, numberOrNull, label, summarize, filterRecords, buildStats, sigRound, formatNumber, toCSV, makeWideTable, sortNames, unique, key };
});
