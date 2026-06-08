import type { RiskProfile, QAAnswer, RiskReport } from './risk-prediction'
import type { LabReportAnalysis } from './gemini'

const BAND_COLOR: Record<string, string> = {
  low: '#22C55E',
  watch: '#F59E0B',
  elevated: '#F97316',
  urgent: '#EF4444',
}
const BAND_LABEL: Record<string, string> = {
  low: 'LOW RISK',
  watch: 'WATCH',
  elevated: 'ELEVATED RISK',
  urgent: 'URGENT — Seek immediate care',
}
const SEVERITY: Record<string, string> = {
  urgent: '🔴 Critical', elevated: '🟠 Elevated', watch: '🟡 Watch', low: '🟢 Low',
}
const STATUS_COLOR: Record<string, string> = {
  normal: '#22C55E', abnormal: '#F59E0B', critical: '#EF4444',
}

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
}

export function generateDrishtiPdf(
  profile: RiskProfile,
  answers: QAAnswer[],
  report: RiskReport,
  labAnalysis?: LabReportAnalysis | null,
): void {
  const bandColor = BAND_COLOR[report.overall_band] ?? '#0E7C66'
  const now = new Date()

  const conditionsHtml = report.conditions.map((c) => {
    const color = BAND_COLOR[c.band] ?? '#0E7C66'
    return `
      <div class="cond" style="border-left:4px solid ${color}">
        <div class="cond-head">
          <span class="cond-name">${esc(c.name)}</span>
          <span class="cond-pct" style="color:${color}">${esc(c.probability)}%</span>
        </div>
        <div class="bar"><div class="bar-fill" style="width:${Number(c.probability)}%;background:${color}"></div></div>
        <div class="cond-meta">
          <span>Band: <b>${esc(c.band).toUpperCase()}</b></span>
          <span>Confidence: <b>${esc(c.confidence)}</b></span>
          <span>${SEVERITY[c.band] ?? ''}</span>
        </div>
        ${c.contributing_symptoms?.length ? `<div class="chips">${c.contributing_symptoms.map((s) => `<span class="chip">${esc(s)}</span>`).join('')}</div>` : ''}
      </div>`
  }).join('')

  const qaHtml = answers.map((a) => `
    <tr><td>${esc(a.questionId.replace('q_', '').replace(/\b\w/g, (m) => m.toUpperCase()))}</td><td>${esc(a.label)}</td></tr>
  `).join('')

  const labHtml = labAnalysis ? `
    <h2>Laboratory Report Analysis</h2>
    <p class="summary">${esc(labAnalysis.summary)}</p>
    ${labAnalysis.extracted_values?.length ? `
      <div class="lab-grid">
        ${labAnalysis.extracted_values.map((v) => `
          <div class="lab-cell" style="border-color:${STATUS_COLOR[v.status] ?? '#cbd5e1'}">
            <div class="lab-name">${esc(v.name)}</div>
            <div class="lab-val">${esc(v.value)} ${esc(v.unit)}</div>
            <div class="lab-status" style="color:${STATUS_COLOR[v.status] ?? '#64748b'}">${esc(v.status)}</div>
          </div>`).join('')}
      </div>` : ''}
    ${labAnalysis.flags?.length ? `
      <div class="flags">
        <b>Lab Flags</b>
        ${labAnalysis.flags.map((f) => `<div>${f.severity === 'high' ? '🔴' : f.severity === 'medium' ? '🟠' : '🟡'} <b>${esc(f.marker)}</b>: ${esc(f.concern)}</div>`).join('')}
      </div>` : ''}
    ${labAnalysis.recommendations?.length ? `
      <div class="recs"><b>Recommendations</b>${labAnalysis.recommendations.map((r) => `<div>→ ${esc(r)}</div>`).join('')}</div>` : ''}
  ` : ''

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Shetu Drishti Report</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; color:#1e293b; padding:0; }
    .wrap { max-width:760px; margin:0 auto; padding:24px; }
    .header { background:linear-gradient(135deg,#0A2E2A,#0E7C66); color:#fff; border-radius:12px; padding:24px; display:flex; justify-content:space-between; align-items:flex-start; }
    .header .brand { font-size:11px; letter-spacing:3px; color:#F2A93B; font-weight:700; }
    .header h1 { font-size:24px; margin-top:4px; }
    .header .tag { font-size:12px; opacity:.8; margin-top:2px; }
    .header .meta { font-size:11px; text-align:right; line-height:1.7; opacity:.95; }
    .band { margin:18px 0 8px; border-radius:8px; padding:12px; text-align:center; color:#fff; font-weight:700; font-size:16px; background:${bandColor}; }
    .action { background:#F0FBF8; border-radius:8px; padding:12px 14px; margin-bottom:6px; }
    .action b { color:#0E7C66; }
    .strip { font-weight:600; font-size:13px; margin:4px 0; }
    .strip.alert { color:#DC2626; }
    .strip.spec { color:#0E7C66; }
    h2 { color:#0E7C66; font-size:15px; margin:20px 0 10px; padding-bottom:6px; border-bottom:1px solid #e2e8f0; }
    .cond { background:#F8FAFC; border-radius:8px; padding:12px 14px; margin-bottom:10px; }
    .cond-head { display:flex; justify-content:space-between; align-items:center; }
    .cond-name { font-weight:600; font-size:14px; }
    .cond-pct { font-weight:700; font-size:15px; }
    .bar { height:8px; background:#e2e8f0; border-radius:99px; overflow:hidden; margin:8px 0; }
    .bar-fill { height:100%; border-radius:99px; }
    .cond-meta { display:flex; gap:16px; font-size:11px; color:#64748b; flex-wrap:wrap; }
    .chips { margin-top:8px; display:flex; flex-wrap:wrap; gap:6px; }
    .chip { background:#e2e8f0; color:#475569; font-size:10px; padding:2px 8px; border-radius:99px; }
    table { width:100%; border-collapse:collapse; font-size:12px; }
    th { background:#0A2E2A; color:#fff; text-align:left; padding:6px 10px; }
    td { padding:6px 10px; border-bottom:1px solid #eef2f6; }
    tr:nth-child(even) td { background:#F8FAFC; }
    .summary { font-size:12.5px; line-height:1.6; color:#334155; margin-bottom:10px; }
    .lab-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
    .lab-cell { border:1px solid; border-radius:8px; padding:8px 10px; font-size:11px; }
    .lab-name { font-weight:600; }
    .lab-val { color:#334155; margin:2px 0; }
    .lab-status { text-transform:capitalize; font-size:10px; }
    .flags, .recs { background:#FFFBEB; border-radius:8px; padding:10px 12px; margin-top:10px; font-size:11.5px; line-height:1.7; }
    .recs { background:#F0FBF8; }
    .footer { margin-top:24px; padding-top:12px; border-top:1px solid #e2e8f0; font-size:10px; color:#94a3b8; line-height:1.5; }
    @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } .wrap { padding:0; } }
  </style></head>
  <body><div class="wrap">
    <div class="header">
      <div>
        <div class="brand">শেতু দৃষ্টি · SHETU DRISHTI</div>
        <h1>Risk Assessment Report</h1>
        <div class="tag">Clinical decision-support · AI generated</div>
      </div>
      <div class="meta">
        <div><b>${esc(now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }))}</b> ${esc(now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }))}</div>
        <div>${esc(profile.gender)}${profile.pregnant ? ' · pregnant' : ''} · ${esc(profile.age)} yrs</div>
        <div>BMI ${profile.bmi?.toFixed(1)} · ${esc(profile.division)}</div>
        <div>${esc((profile.conditions || []).join(', ') || 'No known conditions')}</div>
      </div>
    </div>

    <div class="band">${BAND_LABEL[report.overall_band] ?? esc(report.overall_band)}</div>
    <div class="action"><b>Recommended action:</b> ${esc(report.next_action)}<br><b>Timeframe:</b> ${esc(report.timeframe)}</div>
    ${report.alert_chw ? '<div class="strip alert">⚠ Alert sent to Community Health Worker</div>' : ''}
    ${report.specialist_needed ? '<div class="strip spec">✓ Specialist review recommended (Shetu NRB Network)</div>' : ''}

    <h2>Identified Conditions</h2>
    ${conditionsHtml}

    <h2>Symptom Questionnaire</h2>
    <table><thead><tr><th>Question</th><th>Response</th></tr></thead><tbody>${qaHtml}</tbody></table>

    ${labHtml}

    <div class="footer">
      This report is generated by Shetu Drishti AI for informational purposes only and does not replace
      professional medical advice. Always consult a qualified healthcare provider for diagnosis and treatment.
    </div>
  </div>
  <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 350); };</script>
  </body></html>`

  const w = window.open('', '_blank')
  if (!w) {
    alert('Please allow pop-ups to download the PDF report.')
    return
  }
  w.document.open()
  w.document.write(html)
  w.document.close()
}
