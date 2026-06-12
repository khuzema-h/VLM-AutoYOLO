import type { CompareReportResponse } from "@/services/api";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function metricClass(value: number, good = 0.7): string {
  return value >= good ? "good" : "warn";
}

export function buildCompareReportHtml(
  report: CompareReportResponse,
  thumbnails: Record<string, string> = {},
): string {
  const generatedAt = new Date().toISOString();
  const reportJson = JSON.stringify(report).replace(/</g, "\\u003c");
  const thumbJson = JSON.stringify(thumbnails).replace(/</g, "\\u003c");
  const thumbCount = Object.keys(thumbnails).length;

  const constraints =
    [
      report.maxBBoxArea < 1 ? `max bbox area ${Math.round(report.maxBBoxArea * 100)}%` : null,
      report.minConfidence > 0 ? `min confidence ${Math.round(report.minConfidence * 100)}%` : null,
    ]
      .filter(Boolean)
      .join(" · ") || "none";

  const labelMapEntries = Object.entries(report.labelMap);
  const global = report.overall.global;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>VLM Compare Report — ${escapeHtml(report.dataset)}</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f8fafc;
      --card: #ffffff;
      --border: #e2e8f0;
      --text: #0f172a;
      --muted: #64748b;
      --primary: #2563eb;
      --good: #059669;
      --warn: #d97706;
      --bad: #dc2626;
      --amber: #b45309;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
    }
    .wrap { max-width: 1200px; margin: 0 auto; padding: 24px 20px 48px; }
    h1 { font-size: 1.5rem; margin: 0 0 4px; }
    h2 { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); margin: 0 0 12px; }
    .sub { color: var(--muted); font-size: 0.85rem; margin-bottom: 20px; }
    .grid { display: grid; gap: 16px; }
    .grid-4 { grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 16px 18px;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
    }
    .metric-value { font-size: 1.75rem; font-weight: 800; margin-top: 4px; }
    .metric-value.good { color: var(--good); }
    .metric-value.warn { color: var(--warn); }
    .metric-sub { font-size: 0.75rem; color: var(--muted); margin-top: 6px; font-weight: 600; }
    .tags { display: flex; flex-wrap: wrap; gap: 6px; }
    .tag {
      display: inline-block;
      background: #dbeafe;
      color: #1d4ed8;
      border-radius: 999px;
      padding: 2px 10px;
      font-size: 0.75rem;
      font-weight: 600;
    }
    table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
    th, td { padding: 10px 8px; border-bottom: 1px solid var(--border); text-align: left; }
    th { color: var(--muted); font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em; }
    td.num, th.num { text-align: right; }
    td.center, th.center { text-align: center; }
    .linkish {
      background: none; border: none; padding: 0; font: inherit; font-weight: 700;
      cursor: pointer; text-decoration: underline; text-underline-offset: 2px;
    }
    .linkish.tp { color: var(--good); }
    .linkish.fp { color: var(--bad); }
    .linkish.fn { color: var(--amber); }
    .toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 12px; }
    .btn {
      border: 1px solid var(--border);
      background: #fff;
      color: var(--text);
      border-radius: 999px;
      padding: 6px 12px;
      font-size: 0.78rem;
      font-weight: 700;
      cursor: pointer;
    }
    .btn.active { background: var(--primary); border-color: var(--primary); color: #fff; }
    .btn:hover:not(.active) { background: #f1f5f9; }
    .pill {
      display: inline-flex; align-items: center; gap: 6px;
      background: #eff6ff; color: #1d4ed8; border-radius: 999px;
      padding: 4px 10px; font-size: 0.75rem; font-weight: 700;
    }
    .pill button {
      border: none; background: transparent; color: inherit; cursor: pointer; font-weight: 900;
    }
    input[type="search"] {
      border: 1px solid var(--border); border-radius: 10px; padding: 8px 12px;
      min-width: 220px; font-size: 0.82rem;
    }
    .pager { display: flex; gap: 8px; align-items: center; justify-content: flex-end; margin-top: 12px; font-size: 0.8rem; color: var(--muted); }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 0.75rem; }
    .path { color: var(--muted); font-size: 0.72rem; word-break: break-all; }
    .thumb {
      width: 128px;
      height: auto;
      max-height: 96px;
      object-fit: contain;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: #0f172a;
      cursor: zoom-in;
      display: block;
    }
    .thumb-missing {
      width: 96px;
      height: 72px;
      border-radius: 8px;
      border: 1px dashed var(--border);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--muted);
      font-size: 0.65rem;
      background: #f8fafc;
    }
    .legend { display: flex; flex-wrap: wrap; gap: 14px; font-size: 0.78rem; font-weight: 700; margin-bottom: 12px; }
    .legend-item { display: inline-flex; align-items: center; gap: 6px; }
    .legend-swatch { width: 14px; height: 14px; border-radius: 3px; display: inline-block; }
    .legend-swatch.gt { background: #10B981; }
    .legend-swatch.vlm { background: #3B82F6; }
    .legend-swatch.unmapped { background: #F59E0B; border: 2px dashed #d97706; width: 12px; height: 12px; }
    .footer { margin-top: 28px; color: var(--muted); font-size: 0.75rem; text-align: center; }
    @media (max-width: 700px) {
      .wrap { padding: 16px 12px 32px; }
      input[type="search"] { min-width: 100%; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <header class="card" style="margin-bottom: 20px;">
      <h1>VLM Dataset Compare Report</h1>
      <div class="sub">
        <strong>${escapeHtml(report.dataset)}</strong> · IoU ≥ ${report.iouThreshold} · generated ${escapeHtml(generatedAt)}
      </div>
      <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; font-size: 0.82rem;">
        <div><span style="color: var(--muted); font-weight: 700;">VLM labels</span><div class="tags" style="margin-top: 6px;">${report.vlmLabels.map((l) => `<span class="tag">${escapeHtml(l)}</span>`).join("")}</div></div>
        <div><span style="color: var(--muted); font-weight: 700;">Constraints</span><div style="margin-top: 6px; font-weight: 600;">${escapeHtml(constraints)}</div></div>
        <div><span style="color: var(--muted); font-weight: 700;">Images evaluated</span><div style="margin-top: 6px; font-weight: 600;">${report.imagesEvaluated}${report.imagesSkipped ? ` (${report.imagesSkipped} skipped)` : ""}</div></div>
        <div><span style="color: var(--muted); font-weight: 700;">Boxes</span><div style="margin-top: 6px; font-weight: 600;">GT ${report.gtBoxTotal} · VLM ${report.vlmBoxTotal}${report.unmappedVlmTotal ? ` · ${report.unmappedVlmTotal} unmapped` : ""}</div></div>
        <div><span style="color: var(--muted); font-weight: 700;">Thumbnails</span><div style="margin-top: 6px; font-weight: 600;">${thumbCount} embedded</div></div>
      </div>
      ${
        labelMapEntries.length
          ? `<div style="margin-top: 12px; font-size: 0.8rem;"><span style="color: var(--muted); font-weight: 700;">Label mapping</span><div style="margin-top: 4px;">${labelMapEntries.map(([vlm, gt]) => `<span class="tag">${escapeHtml(vlm)} → ${escapeHtml(gt)}</span>`).join(" ")}</div></div>`
          : ""
      }
    </header>

    <section class="grid grid-4">
      <div class="card"><h2>F1 Score</h2><div class="metric-value ${metricClass(global.f1)}">${pct(global.f1)}</div></div>
      <div class="card"><h2>Precision</h2><div class="metric-value ${metricClass(global.precision)}">${pct(global.precision)}</div><div class="metric-sub">TP ${global.tp} · FP ${global.fp}</div></div>
      <div class="card"><h2>Recall</h2><div class="metric-value ${metricClass(global.recall)}">${pct(global.recall)}</div><div class="metric-sub">TP ${global.tp} · FN ${global.fn}</div></div>
      <div class="card"><h2>Mean IoU</h2><div class="metric-value ${metricClass(global.meanIou, 0.6)}">${pct(global.meanIou)}</div></div>
    </section>

    ${
      report.splitStats.length > 1
        ? `<section class="section card"><h2>Split Breakdown</h2><table><thead><tr><th>Split</th><th class="center">Images</th><th class="center">TP</th><th class="center">FP</th><th class="center">FN</th><th class="num">Precision</th><th class="num">Recall</th><th class="num">F1</th><th class="num">Mean IoU</th></tr></thead><tbody>${report.splitStats
            .map(
              (row) =>
                `<tr><td><strong>${escapeHtml(row.split)}</strong></td><td class="center">${row.images}</td><td class="center">${row.tp}</td><td class="center">${row.fp}</td><td class="center">${row.fn}</td><td class="num">${pct(row.precision)}</td><td class="num">${pct(row.recall)}</td><td class="num"><strong>${pct(row.f1)}</strong></td><td class="num">${pct(row.meanIou)}</td></tr>`,
            )
            .join("")}</tbody></table></section>`
        : ""
    }

    <section class="section card">
      <h2>Per-Class Metrics</h2>
      <table>
        <thead>
          <tr>
            <th>Class</th><th class="center">GT</th><th class="center">VLM</th>
            <th class="center">TP</th><th class="center">FP</th><th class="center">FN</th>
            <th class="num">Precision</th><th class="num">Recall</th><th class="num">F1</th><th class="num">Mean IoU</th>
          </tr>
        </thead>
        <tbody id="class-body"></tbody>
      </table>
    </section>

    <section class="section card" id="cases-section">
      <h2>Investigate Cases</h2>
      <p class="sub" style="margin-top: -6px;">Previews show ground-truth and VLM boxes. Click a preview to zoom.</p>
      <div class="legend">
        <span class="legend-item"><span class="legend-swatch gt"></span> Ground Truth</span>
        <span class="legend-item"><span class="legend-swatch vlm"></span> VLM (mapped)</span>
        <span class="legend-item"><span class="legend-swatch unmapped"></span> VLM (unmapped)</span>
      </div>
      <div class="toolbar">
        <div id="filter-buttons"></div>
        <span id="class-pill"></span>
        <input type="search" id="case-search" placeholder="Search image path…" />
        <span class="pill" id="case-count"></span>
      </div>
      <table>
        <thead>
          <tr>
            <th>Preview</th><th>Image</th><th>Path</th><th class="center">TP</th><th class="center">FP</th><th class="center">FN</th><th class="num">F1</th>
          </tr>
        </thead>
        <tbody id="cases-body"></tbody>
      </table>
      <div class="pager">
        <button class="btn" id="prev-page">Prev</button>
        <span id="page-label"></span>
        <button class="btn" id="next-page">Next</button>
      </div>
    </section>

    <div class="footer">Exported from VLM-AutoYOLO Compare · standalone interactive report</div>
  </div>

  <script id="report-data" type="application/json">${reportJson}</script>
  <script id="thumb-data" type="application/json">${thumbJson}</script>
  <script>
    const report = JSON.parse(document.getElementById('report-data').textContent);
    const thumbs = JSON.parse(document.getElementById('thumb-data').textContent || '{}');
    const PAGE_SIZE = 25;
    let state = { kind: 'issues', className: null, search: '', page: 0 };

    function pct(v) { return (v * 100).toFixed(1) + '%'; }
    function esc(s) {
      return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }
    function classMetric(img, className, field) {
      if (!className) return img[field] || 0;
      return (img.classStats && img.classStats[className] && img.classStats[className][field]) || 0;
    }
    function matches(img) {
      const { kind, className } = state;
      if (kind === 'unmapped') return !className && img.unmapped > 0;
      if (kind === 'fp') return classMetric(img, className, 'fp') > 0;
      if (kind === 'fn') return classMetric(img, className, 'fn') > 0;
      if (kind === 'tp') return classMetric(img, className, 'tp') > 0;
      return classMetric(img, className, 'fp') + classMetric(img, className, 'fn') > 0;
    }
    function score(img) {
      const { kind, className } = state;
      if (kind === 'fp') return classMetric(img, className, 'fp');
      if (kind === 'fn') return classMetric(img, className, 'fn');
      if (kind === 'tp') return classMetric(img, className, 'tp');
      if (kind === 'unmapped') return img.unmapped || 0;
      return classMetric(img, className, 'fp') + classMetric(img, className, 'fn');
    }
    function filteredCases() {
      const q = state.search.trim().toLowerCase();
      return (report.imageStats || [])
        .filter((img) => matches(img))
        .filter((img) => !q || img.key.toLowerCase().includes(q) || img.imagePath.toLowerCase().includes(q))
        .sort((a, b) => score(b) - score(a));
    }
    function openLightbox(src, title) {
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.88);display:flex;align-items:center;justify-content:center;z-index:9999;cursor:zoom-out;padding:24px;';
      overlay.innerHTML = '<div style="text-align:center;max-width:95vw;"><img src="' + src + '" style="max-width:100%;max-height:85vh;border-radius:12px;box-shadow:0 20px 50px rgba(0,0,0,0.35);" /><div style="color:#fff;margin-top:12px;font-size:0.85rem;">' + esc(title) + '</div></div>';
      overlay.onclick = () => overlay.remove();
      document.body.appendChild(overlay);
    }
    function thumbHtml(key, title) {
      const src = thumbs[key];
      if (!src) return '<div class="thumb-missing">No thumb</div>';
      return '<img class="thumb" src="' + src + '" alt="" data-title="' + esc(title) + '" />';
    }
    function metricBtn(value, tone, className, kind) {
      if (!value) return String(value);
      return '<button class="linkish ' + tone + '" data-kind="' + kind + '" data-class="' + esc(className) + '">' + value + '</button>';
    }
    function renderClassTable() {
      const body = document.getElementById('class-body');
      body.innerHTML = (report.overall.classStats || []).map((row) => {
        return '<tr><td><strong>' + esc(row.className) + '</strong></td>' +
          '<td class="center">' + row.gtCount + '</td><td class="center">' + row.vlmCount + '</td>' +
          '<td class="center">' + metricBtn(row.tp, 'tp', row.className, 'tp') + '</td>' +
          '<td class="center">' + metricBtn(row.fp, 'fp', row.className, 'fp') + '</td>' +
          '<td class="center">' + metricBtn(row.fn, 'fn', row.className, 'fn') + '</td>' +
          '<td class="num">' + pct(row.precision) + '</td><td class="num">' + pct(row.recall) + '</td>' +
          '<td class="num"><strong>' + pct(row.f1) + '</strong></td><td class="num">' + pct(row.meanIou) + '</td></tr>';
      }).join('');
      body.querySelectorAll('button[data-kind]').forEach((btn) => {
        btn.addEventListener('click', () => {
          state.kind = btn.dataset.kind;
          state.className = btn.dataset.class;
          state.page = 0;
          render();
          document.getElementById('cases-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      });
    }
    function renderFilters() {
      const kinds = [
        ['issues', 'Any issue'],
        ['fn', 'False negatives'],
        ['fp', 'False positives'],
        ['unmapped', 'Unmapped VLM'],
        ['tp', 'Matched'],
      ];
      const wrap = document.getElementById('filter-buttons');
      wrap.innerHTML = kinds.map(([kind, label]) =>
        '<button class="btn' + (state.kind === kind ? ' active' : '') + '" data-kind="' + kind + '">' + label + '</button>'
      ).join('');
      wrap.querySelectorAll('button').forEach((btn) => {
        btn.addEventListener('click', () => {
          state.kind = btn.dataset.kind;
          state.page = 0;
          render();
        });
      });
      const pill = document.getElementById('class-pill');
      if (state.className) {
        pill.innerHTML = '<span class="pill">Class: ' + esc(state.className) + ' <button type="button" id="clear-class">×</button></span>';
        document.getElementById('clear-class').onclick = () => { state.className = null; state.page = 0; render(); };
      } else {
        pill.innerHTML = '';
      }
    }
    function renderCases() {
      const rows = filteredCases();
      const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
      state.page = Math.min(state.page, totalPages - 1);
      const slice = rows.slice(state.page * PAGE_SIZE, (state.page + 1) * PAGE_SIZE);
      const body = document.getElementById('cases-body');
      body.innerHTML = slice.map((row) => {
        const short = row.key.split('/').pop() || row.key;
        return '<tr><td>' + thumbHtml(row.key, short) + '</td>' +
          '<td><div><strong>' + esc(short) + '</strong><div class="mono">' + esc(row.split) + '</div></div></td>' +
          '<td class="path">' + esc(row.imagePath) + '</td>' +
          '<td class="center" style="color: var(--good); font-weight:700;">' + row.tp + '</td>' +
          '<td class="center" style="color:' + (row.fp ? 'var(--bad)' : 'var(--muted)') + '; font-weight:700;">' + row.fp + '</td>' +
          '<td class="center" style="color:' + (row.fn ? 'var(--amber)' : 'var(--muted)') + '; font-weight:700;">' + row.fn + '</td>' +
          '<td class="num">' + pct(row.f1) + '</td></tr>';
      }).join('') || '<tr><td colspan="7" style="color: var(--muted);">No images match this filter.</td></tr>';
      body.querySelectorAll('img.thumb').forEach((img) => {
        img.addEventListener('click', () => openLightbox(img.src, img.dataset.title || ''));
      });
      document.getElementById('case-count').textContent = rows.length + ' images';
      document.getElementById('page-label').textContent = 'Page ' + (state.page + 1) + ' / ' + totalPages;
      document.getElementById('prev-page').disabled = state.page <= 0;
      document.getElementById('next-page').disabled = state.page >= totalPages - 1;
    }
    function render() {
      renderClassTable();
      renderFilters();
      renderCases();
    }
    document.getElementById('case-search').addEventListener('input', (e) => {
      state.search = e.target.value;
      state.page = 0;
      renderCases();
    });
    document.getElementById('prev-page').addEventListener('click', () => { if (state.page > 0) { state.page--; renderCases(); } });
    document.getElementById('next-page').addEventListener('click', () => { state.page++; renderCases(); });
    render();
  </script>
</body>
</html>`;
}

export function downloadCompareReportHtml(
  report: CompareReportResponse,
  thumbnails: Record<string, string> = {},
): void {
  const html = buildCompareReportHtml(report, thumbnails);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 10);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${report.dataset}_vlm_report_${stamp}.html`;
  anchor.click();
  URL.revokeObjectURL(url);
}
