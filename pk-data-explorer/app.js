/* PK Data Explorer — browser UI. Inputs never leave the user's browser. */
(() => {
  'use strict';
  const C = window.PKCore;
  const $ = id => document.getElementById(id);
  const state = {
    sheets: {}, filename: '', headers: [], rows: [], time: '', conc: '', animal: '',
    facetRow: '', facetCol: '', series: [], statGroups: [], filters: {},
    plotMode: 'mean_sd', yScale: 'log', rowMode: 'replicate', sig: 3, notation: 'decimal',
    activeTab: 'plots', stats: null, wide: null, selected: [], plotData: [],
    plotSize: { width: 800, height: 500 }
  };
  const palette = ['#197b9d', '#d19a29', '#8a64be', '#26947e', '#d16a69', '#526bbd', '#9a7b52', '#cc5ca3'];
  const symbols = ['circle', 'triangle-up', 'square', 'diamond', 'cross', 'triangle-down', 'x', 'star'];
  const escapeHTML = s => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const setMessage = (s, isError = false) => { $('status').textContent = s; $('status').className = 'status' + (isError ? ' error' : ''); };
  const options = (cols, selected = '', includeNone = false) => (includeNone ? `<option value="">(none)</option>` : '') + cols.map(c => `<option value="${escapeHTML(c)}" ${c === selected ? 'selected' : ''}>${escapeHTML(c)}</option>`).join('');
  const groupColumns = () => state.headers.filter(c => c !== state.time && c !== state.conc && !/(conc|concentration)/i.test(c));
  const pretty = col => col ? col.replace(/_/g, ' ') : '(none)';
  const findCol = (...terms) => state.headers.find(h => terms.some(t => t.test(h))) || '';
  const fname = () => (state.filename || 'pk-data').replace(/\.(xlsx|xls|csv|txt)$/i, '').replace(/[^a-zA-Z0-9-_]+/g, '_').slice(0, 65);

  function initializeColumns() {
    state.time = findCol(/^nominal[_ ]time/i, /^sampling[_ ]time/i, /^time(\s*\(|[_ ]|$)/i) || state.headers[0] || '';
    state.conc = findCol(/estimated[_ ]tissue[_ ]conc.*report/i, /^tissue.*conc/i, /reported.*conc/i, /^concentration$/i, /conc/i) || state.headers.find(h => h !== state.time) || '';
    state.animal = findCol(/^animal[_ ]?id$/i, /^subject[_ ]?id$/i, /animal/i) || '';
    state.filters = {};
    let g = groupColumns();
    state.facetRow = g.find(x => /sample[_ ]?type|matrix|tissue/i.test(x)) || '';
    state.facetCol = g.find(x => /analyte|compound/i.test(x)) || '';
    state.series = g.filter(x => /^group$|^route$|dose[_ ]?route|treatment[_ ]?group/i.test(x)).slice(0, 2);
    state.statGroups = [state.facetCol, state.facetRow, ...state.series].filter((x, i, a) => x && a.indexOf(x) === i);
    if (!state.statGroups.length) state.statGroups = g.slice(0, 2);
    state.rowMode = 'replicate';
    $('individual-layout').value = 'replicate';
    state.yScale = 'log'; $('y-scale').value = 'log';
    state.plotMode = 'mean_sd'; $('plot-mode').value = 'mean_sd';
    $('y-label').value = `Concentration${state.conc.match(/\(([^()]*ng\/?[^()]*)\)/i) ? ' (' + RegExp.$1 + ')' : ''}`;
    refreshInputControls();
    refreshPlotControls();
    refreshStatControls();
    refreshFilters();
    $('workspace').hidden = false;
    updateAll();
  }

  function refreshInputControls() {
    $('import-details').hidden = false;
    $('dataset-name').textContent = state.filename || 'Dataset';
    $('dataset-count').textContent = `${state.rows.length.toLocaleString()} rows · ${state.headers.length} columns`;
    $('sheet-select').innerHTML = options(Object.keys(state.sheets), state.sheet);
    $('sheet-select').disabled = Object.keys(state.sheets).length < 2;
    $('time-select').innerHTML = options(state.headers, state.time);
    $('conc-select').innerHTML = options(state.headers, state.conc);
    $('animal-select').innerHTML = options(state.headers, state.animal, true);
  }
  function refreshPlotControls() {
    const cols = groupColumns();
    $('facet-row').innerHTML = options(cols, state.facetRow, true);
    $('facet-col').innerHTML = options(cols, state.facetCol, true);
    $('series-picks').innerHTML = cols.map(col => `<label class="check-chip"><input type="checkbox" data-group="${escapeHTML(col)}" ${state.series.includes(col) ? 'checked' : ''}>${escapeHTML(pretty(col))}</label>`).join('');
  }
  function refreshStatControls() {
    const cols = groupColumns();
    state.statGroups = state.statGroups.filter(c => cols.includes(c));
    $('stats-group-picks').innerHTML = state.statGroups.length ? state.statGroups.map((col, i) => `<div class="group-row"><span>${i + 1}. ${escapeHTML(pretty(col))}</span><div class="group-buttons"><button type="button" title="Move up" data-action="up" data-index="${i}" ${!i ? 'disabled' : ''}>↑</button><button type="button" title="Move down" data-action="down" data-index="${i}" ${i === state.statGroups.length - 1 ? 'disabled' : ''}>↓</button><button type="button" title="Remove" data-action="remove" data-index="${i}">×</button></div></div>`).join('') : '<p class="help">No grouping: summarize all selected records together.</p>';
    const available = cols.filter(c => !state.statGroups.includes(c));
    $('stats-add-select').innerHTML = options(available);
    $('stats-add').disabled = available.length === 0;
  }
  function refreshFilters() {
    const cols = groupColumns().filter(c => C.unique(state.rows.map(r => C.label(r[c]))).length <= 100);
    $('filters').innerHTML = cols.map(col => {
      const vals = C.sortNames(C.unique(state.rows.map(r => C.label(r[col]))));
      if (vals.length > 100) return '';
      return `<div class="filter-set"><strong>${escapeHTML(col)} (${vals.length})</strong>${vals.map(value => `<label><input type="checkbox" data-filtercol="${escapeHTML(col)}" data-value="${escapeHTML(value)}" ${!(state.filters[col] || []).includes(value) ? 'checked' : ''}>${escapeHTML(value)}</label>`).join('')}</div>`;
    }).join('');
  }

  async function setData(filename, sheets) {
    state.filename = filename;
    state.sheets = sheets;
    state.sheet = Object.keys(sheets)[0];
    switchSheet(state.sheet);
    setMessage(`Loaded ${state.rows.length.toLocaleString()} input records. Data remains on this device.`);
  }
  function switchSheet(sheet) {
    state.sheet = sheet;
    const data = C.rowsFromMatrix(state.sheets[sheet] || []);
    if (!data.headers.length || !data.rows.length) throw new Error('This worksheet has no data rows.');
    state.headers = data.headers;
    state.rows = data.rows;
    initializeColumns();
  }
  async function importFile(file) {
    if (!file) return;
    try {
      setMessage('Reading file locally…');
      let sheets = {};
      if (/\.(xlsx|xls)$/i.test(file.name)) {
        if (!window.XLSX) throw new Error('Excel library could not load. Check your internet connection or try a CSV file.');
        const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        wb.SheetNames.forEach(name => { sheets[name] = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', blankrows: false, raw: true }); });
      } else {
        sheets['CSV'] = C.parseCSV(await file.text());
      }
      await setData(file.name, sheets);
    } catch (err) { setMessage(err.message || 'Unable to read file.', true); }
  }

  function activeRows() { return C.filterRecords(state.rows, state.filters); }
  function updateAll() {
    if (!state.rows.length || !state.time || !state.conc) return;
    try {
      if (state.time === state.conc) throw new Error('Time and concentration must use different input columns.');
      state.selected = activeRows();
      state.stats = C.buildStats(state.selected, { timeCol: state.time, valueCol: state.conc, animalCol: state.animal, groupCols: state.statGroups });
      state.wide = C.makeWideTable(state.stats, { groupCols: state.statGroups, animalCol: state.animal, rowMode: state.rowMode, sig: state.sig, notation: state.notation });
      state.plotData = makePlotData(state.stats);
      const valid = state.selected.filter(r => C.numberOrNull(r[state.time]) !== null && C.numberOrNull(r[state.conc]) !== null).length;
      $('result-info').textContent = `${state.selected.length} selected records · ${valid} numeric observations · ${state.stats.groups.length} summary groups · ${state.stats.times.length} timepoints`;
      renderSummary();
      renderPlotData();
      if (state.activeTab === 'plots') renderPlot();
      setMessage('');
    } catch (err) { console.error(err); setMessage(err.message || 'Unable to analyze data', true); }
  }
  function makePlotData(stats) {
    const out = [];
    for (const g of stats.groups) for (const t of stats.times) {
      const s = g.summaries.get(t) || { n: 0, mean: null, sd: null, cv: null };
      const row = {};
      state.statGroups.forEach((c, i) => row[c] = g.identifiers[i]);
      row[state.time] = t;
      Object.assign(row, s);
      out.push(row);
    }
    return out;
  }
  function renderSummary() {
    const { matrix, entries } = state.wide;
    const table = $('summary-table');
    if (!matrix.length) { table.innerHTML = ''; return; }
    const starts = new Set(entries.map(e => e.firstRow));
    const groupN = state.statGroups.length;
    let html = `<thead><tr>${matrix[0].map(h => `<th>${escapeHTML(h)}</th>`).join('')}</tr></thead><tbody>`;
    matrix.slice(1).forEach((row, ii) => {
      const i = ii + 1;
      const kind = row[groupN];
      const isMetric = ['n','Mean','SD','CV%'].includes(kind);
      const classes = `${starts.has(i) ? 'block-start' : ''} ${isMetric ? 'metric' : ''} ${kind === 'CV%' ? 'metric-cv' : ''}`;
      html += `<tr class="${classes}">` + row.map((v, j) => `<td>${j < groupN && !starts.has(i) ? '' : escapeHTML(v)}</td>`).join('') + '</tr>';
    });
    table.innerHTML = html + '</tbody>';
  }
  function renderPlotData() {
    const cols = [...state.statGroups, state.time, 'n', 'mean', 'sd', 'cv'];
    let html = `<thead><tr>${cols.map(c => `<th>${escapeHTML(c === 'cv' ? 'CV%' : c)}</th>`).join('')}</tr></thead><tbody>`;
    state.plotData.slice(0, 1500).forEach(r => {
      html += `<tr>${cols.map(col => `<td>${escapeHTML(col === 'n' || col === state.time || state.statGroups.includes(col) ? r[col] : C.formatNumber(r[col], state.sig, state.notation))}</td>`).join('')}</tr>`;
    });
    $('plot-data-table').innerHTML = html + '</tbody>';
  }

  function renderPlot() {
    if (!window.Plotly) { $('chart').innerHTML = '<p style="padding:30px;color:#855">Plot library could not load. Check your internet connection. The CSV statistics functions remain available.</p>'; return; }
    const data = state.selected.filter(r => C.numberOrNull(r[state.time]) !== null);
    const rowNames = state.facetRow ? C.sortNames(C.unique(data.map(r => C.label(r[state.facetRow])))) : ['All'];
    const colNames = state.facetCol ? C.sortNames(C.unique(data.map(r => C.label(r[state.facetCol])))) : ['All'];
    if (!rowNames.length || !colNames.length) { Plotly.purge('chart'); $('chart').innerHTML = '<p style="padding:25px">No rows match the current filters.</p>'; return; }
    if (rowNames.length * colNames.length > 48) { $('chart').textContent = 'More than 48 panels selected. Apply filters or choose different panel variables.'; return; }
    const nrow = rowNames.length, ncol = colNames.length;
    // Reserve a dedicated title band between panel rows so titles never overlap the plot above.
    const panelHeight = 230, panelGap = 76, topMargin = 80, bottomMargin = 70;
    const plotAreaHeight = nrow * panelHeight + (nrow - 1) * panelGap;
    const paletteMap = new Map(), traces = [], layout = {
      paper_bgcolor: '#fff', plot_bgcolor: '#fff', font: { family: 'Arial, sans-serif', size: 11, color: '#344a50' },
      height: plotAreaHeight + topMargin + bottomMargin, width: Math.max($('chart').parentElement.clientWidth - 4, 315 * ncol + 95),
      margin: { l: 75, r: 112, t: topMargin, b: bottomMargin },
      legend: { orientation: 'v', x: 1.01, xanchor: 'left', y: .98, bgcolor: '#ffffffbb', font: { size: 11 } },
      annotations: [], showlegend: true, hovermode: 'closest'
    };
    const xGap = ncol === 1 ? 0 : Math.min(0.045, 0.14 / ncol);
    const yGap = nrow === 1 ? 0 : panelGap / plotAreaHeight;
    const xStep = (1 - xGap * (ncol - 1)) / ncol;
    const yStep = panelHeight / plotAreaHeight;
    const legendSeen = new Set();
    const overallTimes = data.map(r => C.numberOrNull(r[state.time])).filter(t => t !== null);
    const minT = Math.min(...overallTimes), maxT = Math.max(...overallTimes);
    let anyPositive = false;
    for (let r = 0; r < nrow; r++) for (let c = 0; c < ncol; c++) {
      const idx = r * ncol + c + 1;
      const xname = idx === 1 ? 'x' : `x${idx}`;
      const yname = idx === 1 ? 'y' : `y${idx}`;
      const xlabel = idx === 1 ? 'xaxis' : `xaxis${idx}`;
      const ylabel = idx === 1 ? 'yaxis' : `yaxis${idx}`;
      const x0 = c * (xStep + xGap), x1 = x0 + xStep;
      const y1 = 1 - r * (yStep + yGap), y0 = y1 - yStep;
      layout[xlabel] = { domain: [x0, x1], anchor: yname, title: r === nrow - 1 ? { text: state.time, font: { size: 11 }, standoff: 6 } : undefined,
        showticklabels: r === nrow - 1, showline: true, linewidth: 1, linecolor: '#86969b', mirror: false, ticks: 'outside', tickfont: { size: 10 }, zeroline: false,
        range: minT === maxT ? [minT - 0.5, maxT + 0.5] : [Math.min(0,minT), maxT + (maxT - Math.min(0,minT)) * .05] };
      layout[ylabel] = { domain: [y0, y1], anchor: xname, title: c === 0 ? { text: $('y-label').value || 'Concentration', font: { size: 11 }, standoff: 2 } : undefined,
        type: state.yScale, showticklabels: c === 0, showline: true, linewidth: 1, linecolor: '#86969b', ticks: 'outside', tickfont: { size: 10 },
        zeroline: false, automargin: true, matches: idx > 1 ? 'y' : undefined };
      const panelParts = [];
      if (state.facetRow) panelParts.push(`${state.facetRow}=${rowNames[r]}`);
      if (state.facetCol) panelParts.push(`${state.facetCol}=${colNames[c]}`);
      layout.annotations.push({ text: panelParts.join(', ') || 'All selected data', x: (x0+x1)/2, y: r === 0 ? 1 + 30 / plotAreaHeight : y1 + yGap / 2, xref: 'paper', yref: 'paper', showarrow: false,
        font: { size: 11, color: '#3d5057' }, xanchor: 'center', yanchor: 'middle' });
      const panel = data.filter(row => (!state.facetRow || C.label(row[state.facetRow]) === rowNames[r]) && (!state.facetCol || C.label(row[state.facetCol]) === colNames[c]));
      const stats = C.buildStats(panel, { timeCol: state.time, valueCol: state.conc, animalCol: state.animal, groupCols: state.series });
      for (const group of stats.groups) {
        const id = group.identifiers.length ? group.identifiers.join(' / ') : 'All selected';
        if (!paletteMap.has(id)) paletteMap.set(id, paletteMap.size);
        const ci = paletteMap.get(id); const color = palette[ci % palette.length];
        const symbol = symbols[ci % symbols.length];
        const times = group.sortedTimes;
        const ys = times.map(t => { const mean = group.summaries.get(t).mean; return state.yScale === 'log' && (mean === null || mean <= 0) ? null : mean; });
        const sd = times.map(t => { const stat = group.summaries.get(t); return stat.sd == null || ys[times.indexOf(t)] === null ? 0 : stat.sd; });
        const leg = !legendSeen.has(id);
        const base = { xaxis: xname, yaxis: yname, legendgroup: id, name: id, showlegend: leg, hovertemplate: '%{x} h<br>%{y:.5g}<extra>%{fullData.name}</extra>' };
        if (state.plotMode !== 'individual') {
          const visible = ys.some(v => v !== null); if (visible) anyPositive = true;
          traces.push({ ...base, type: 'scatter', mode: 'lines+markers', x: times, y: ys, connectgaps: false,
            line: { color, width: 1.7, shape: 'linear' }, marker: { color, symbol, size: 6 },
            error_y: state.plotMode === 'mean_sd' ? { type: 'data', symmetric: false, array: sd, arrayminus: sd.map(() => 0), visible: true, thickness: 1, width: 2, color } : undefined });
          legendSeen.add(id);
        }
        if (state.plotMode === 'individual' || state.plotMode === 'mean_individual') {
          const individualMap = new Map();
          for (const t of times) for (const rec of group.times.get(t) || []) {
            const animal = rec.animal || `Record ${individualMap.size + 1}`;
            if (!individualMap.has(animal)) individualMap.set(animal, []);
            individualMap.get(animal).push({ t, y: rec.value });
          }
          for (const [animal, arr] of individualMap.entries()) {
            arr.sort((a,b) => a.t - b.t);
            const x = arr.map(v => v.t), y = arr.map(v => state.yScale === 'log' && (v.y === null || v.y <= 0) ? null : v.y);
            if (y.some(v => v !== null)) anyPositive = true;
            if (state.plotMode === 'individual') {
              const lname = `${id} · ${animal}`;
              traces.push({ ...base, name: lname, showlegend: !legendSeen.has(lname), legendgroup: lname, type: 'scatter', mode: 'lines+markers', x, y,
                connectgaps: false, line: { color, width: 1, shape: 'linear' }, marker: { color, symbol, size: 6 } });
              legendSeen.add(lname);
            } else {
              traces.push({ ...base, name: `${id} · ${animal}`, showlegend: false, type: 'scatter', mode: 'markers', x, y,
                marker: { color, symbol, opacity: .38, size: 5 } });
            }
          }
        }
      }
    }
    if (state.yScale === 'log' && !anyPositive) $('plot-note').textContent = 'No positive concentrations available for log-scale plotting. Numeric zeros remain in descriptive statistics.';
    else $('plot-note').textContent = 'Straight-line segments only; no smoothing or fitted curves. On a logarithmic axis, zero and negative concentrations are hidden from the figure but retained in statistics.';
    $('chart').style.width = `${layout.width}px`;
    state.plotSize = { width: layout.width, height: layout.height };
    Plotly.react('chart', traces, layout, { responsive: false, displaylogo: false, scrollZoom: false, modeBarButtonsToRemove: ['lasso2d','select2d','autoScale2d'] })
      .catch(err => setMessage('Could not render graph: ' + err.message, true));
  }

  function downloadText(text, filename, mimetype = 'text/csv;charset=utf-8') {
    const blob = new Blob(['\uFEFF', text], { type: mimetype }); const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function downloadPlotCSV() {
    const cols = [...state.statGroups, state.time, 'n', 'mean', 'sd', 'cv'];
    const matrix = [cols, ...state.plotData.map(row => cols.map(c => row[c] === null || row[c] === undefined ? 'NA' : row[c]))];
    downloadText(C.toCSV(matrix), fname() + '_plot_data.csv');
  }
  function writeExcel() {
    if (!window.XLSX) { setMessage('Excel library not available; use CSV export or check your connection.', true); return; }
    const book = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(state.wide.matrix);
    const catCols = state.statGroups.length;
    for (let r = 1; r < state.wide.matrix.length; r++) for (let c = catCols + 1; c < state.wide.matrix[r].length; c++) {
      const value = state.wide.matrix[r][c];
      if (typeof value !== 'string' || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:E[+-]?\d+)?$/i.test(value)) continue;
      const addr = XLSX.utils.encode_cell({ r, c });
      const decimal = value.includes('.') && !/E/i.test(value) ? value.split('.')[1].length : 0;
      ws[addr] = { t: 'n', v: Number(value), z: state.notation === 'scientific' ? `0.${'0'.repeat(Math.max(0,state.sig - 1))}E+00` : decimal ? `0.${'0'.repeat(decimal)}` : '0' };
    }
    ws['!cols'] = [...state.statGroups.map(() => ({wch:22})), {wch:17}, ...state.stats.times.map(() => ({wch:14}))];
    ws['!merges'] = [];
    state.wide.entries.forEach(e => {
      for (let c = 0; c < catCols; c++) if (e.lastRow > e.firstRow) ws['!merges'].push({ s: {r:e.firstRow,c}, e:{r:e.lastRow,c} });
    });
    XLSX.utils.book_append_sheet(book, ws, 'Wide summary');
    const longCols = [...state.statGroups, state.time, 'n', 'mean', 'sd', 'cv'];
    const long = XLSX.utils.aoa_to_sheet([longCols, ...state.plotData.map(r => longCols.map(c => r[c] === null ? 'NA' : r[c]))]);
    long['!cols'] = longCols.map(() => ({wch:20}));
    XLSX.utils.book_append_sheet(book, long, 'Unrounded statistics');
    const rawRows = state.selected.map(row => {
      const copy = {...row};
      for (const c of [state.time, state.conc]) { const n = C.numberOrNull(copy[c]); if (n !== null) copy[c] = n; }
      return copy;
    });
    const raw = XLSX.utils.json_to_sheet(rawRows, {header:state.headers});
    raw['!cols'] = state.headers.map(c => ({wch:Math.min(48, Math.max(14, c.length + 2))}));
    XLSX.utils.book_append_sheet(book, raw, 'Selected input data');
    const settings = [ ['Setting','Value'],['Input file',state.filename],['Worksheet',state.sheet],['Time column',state.time],['Concentration column',state.conc],['Animal ID column',state.animal],['Statistics group variables',state.statGroups.join(' > ')],['Figure row panels',state.facetRow],['Figure column panels',state.facetCol],['Figure curve groups',state.series.join(' > ')],['Graph mode',state.plotMode],['Y scale',state.yScale],['Individual layout',state.rowMode],['Significant digits',state.sig],['Number format',state.notation],['Missing-value policy','Nonnumeric or blank = excluded'],['Zero policy','Numeric zero included'],['Variance','Sample SD (n - 1)'] ];
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(settings), 'Analysis settings');
    XLSX.writeFile(book, fname() + '_PK_summary.xlsx', { compression:true });
  }
  async function exportFigure(format) {
    if (!window.Plotly || !state.selected.length) return setMessage('No plot to export.', true);
    try {
      await Plotly.downloadImage($('chart'), { format, filename: fname() + '_PK_profiles', width: state.plotSize.width, height: state.plotSize.height, scale: format === 'png' ? 2 : 1 });
      setMessage(`Exported ${format.toUpperCase()} figure.`);
    } catch(err) { setMessage(`Figure export failed: ${err.message}`, true); }
  }

  // Events
  $('file-input').addEventListener('change', e => importFile(e.target.files[0]));
  $('demo-button').addEventListener('click', async () => {
    try { const response = await fetch('./sample.csv'); if (!response.ok) throw new Error('Synthetic sample file unavailable'); await setData('synthetic_example.csv', { CSV: C.parseCSV(await response.text()) }); }
    catch(err) { setMessage(err.message, true); }
  });
  $('sheet-select').addEventListener('change', e => { try { switchSheet(e.target.value); } catch(err) { setMessage(err.message, true); } });
  $('time-select').addEventListener('change', e => { state.time = e.target.value; refreshPlotControls(); refreshStatControls(); refreshFilters(); updateAll(); });
  $('conc-select').addEventListener('change', e => { state.conc = e.target.value; $('y-label').value = `Concentration${state.conc.match(/\(([^()]*ng\/?[^()]*)\)/i) ? ' (' + RegExp.$1 + ')' : ''}`; refreshPlotControls(); refreshStatControls(); refreshFilters(); updateAll(); });
  $('animal-select').addEventListener('change', e => { state.animal = e.target.value; updateAll(); });
  $('facet-row').addEventListener('change', e => { state.facetRow = e.target.value; updateAll(); });
  $('facet-col').addEventListener('change', e => { state.facetCol = e.target.value; updateAll(); });
  $('series-picks').addEventListener('change', e => { if (e.target.matches('input[data-group]')) { const col = e.target.dataset.group; state.series = e.target.checked ? [...state.series, col] : state.series.filter(c => c !== col); updateAll(); } });
  $('plot-mode').addEventListener('change', e => { state.plotMode = e.target.value; updateAll(); });
  $('y-scale').addEventListener('change', e => { state.yScale = e.target.value; updateAll(); });
  $('y-label').addEventListener('change', updateAll);
  $('individual-layout').addEventListener('change', e => { state.rowMode = e.target.value; updateAll(); });
  $('sig-digits').addEventListener('change', e => { state.sig = Math.max(1, Math.min(12, Math.trunc(Number(e.target.value) || 3))); e.target.value = state.sig; updateAll(); });
  $('number-style').addEventListener('change', e => { state.notation = e.target.value; updateAll(); });
  $('stats-add').addEventListener('click', () => { const col = $('stats-add-select').value; if (col && !state.statGroups.includes(col)) { state.statGroups.push(col); refreshStatControls(); updateAll(); } });
  $('stats-group-picks').addEventListener('click', e => { const button = e.target.closest('button[data-action]'); if (!button) return; const i = Number(button.dataset.index), action = button.dataset.action;
    if (action === 'remove') state.statGroups.splice(i,1);
    else { const j = i + (action === 'up' ? -1 : 1); if (j < 0 || j >= state.statGroups.length) return; [state.statGroups[i],state.statGroups[j]] = [state.statGroups[j],state.statGroups[i]]; }
    refreshStatControls(); updateAll(); });
  $('filters').addEventListener('change', e => { if (!e.target.matches('input[data-filtercol]')) return; const {filtercol:col, value} = e.target.dataset;
    const excluded = new Set(state.filters[col] || []); if (e.target.checked) excluded.delete(value); else excluded.add(value); state.filters[col] = [...excluded]; updateAll(); });
  $('reset-filters').addEventListener('click', () => { state.filters = {}; refreshFilters(); updateAll(); });
  document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => {
    state.activeTab = tab.dataset.tab;
    document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active',x === tab));
    ['plots','summary','plotdata'].forEach(pane => $(`${pane}-pane`).hidden = pane !== state.activeTab);
    if (state.activeTab === 'plots') renderPlot();
  }));
  $('export-png').addEventListener('click', () => exportFigure('png'));
  $('export-svg').addEventListener('click', () => exportFigure('svg'));
  $('export-summary-csv').addEventListener('click', () => downloadText(C.toCSV(state.wide.matrix), fname() + '_wide_summary.csv'));
  $('export-plot-csv').addEventListener('click', downloadPlotCSV);
  $('export-excel').addEventListener('click', writeExcel);
  $('export-all-excel').addEventListener('click', writeExcel);
})();
