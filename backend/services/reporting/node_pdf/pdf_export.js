import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import React from 'react';
import puppeteer from 'puppeteer';
import satori from 'satori';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return null;
  return process.argv[idx + 1] || null;
}

async function findFontBuffer() {
  const candidates = [
    process.env.VISIONAI_PDF_FONT_PATH,
    'C:/Windows/Fonts/arial.ttf',
    'C:/Windows/Fonts/segoeui.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      const data = await fs.readFile(candidate);
      return data;
    } catch (_error) {
      // keep trying candidates
    }
  }

  throw new Error('No usable font found for Satori rendering. Set VISIONAI_PDF_FONT_PATH.');
}

function buildChartData(payload) {
  const metrics = [];
  const dataBias = payload.dataAnalysis || {};
  for (const [attribute, result] of Object.entries(dataBias)) {
    const di = Number(result?.metrics?.disparate_impact ?? 1);
    metrics.push({
      attribute,
      value: Math.max(0, Math.min(1.4, di)),
      severity: result?.severity || 'PASS',
    });
  }

  if (metrics.length === 0) {
    return [
      { attribute: 'No critical data findings', value: 1.0, severity: 'PASS' },
    ];
  }

  return metrics.slice(0, 6);
}

function buildChartElement(data) {
  const maxValue = Math.max(...data.map((item) => item.value), 1);

  return React.createElement(
    'div',
    {
      style: {
        width: '980px',
        height: '260px',
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: '14px',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      },
    },
    React.createElement(
      'div',
      {
        style: {
          fontSize: '20px',
          fontWeight: 700,
          color: '#111827',
        },
      },
      'Disparate Impact Snapshot (React chart rendered to PNG)'
    ),
    React.createElement(
      'div',
      {
        style: {
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          marginTop: '8px',
        },
      },
      ...data.map((item) => {
        const fillColor = item.severity === 'CRITICAL'
          ? '#dc2626'
          : item.severity === 'HIGH'
            ? '#ea580c'
            : '#16a34a';

        return React.createElement(
          'div',
          {
            key: item.attribute,
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            },
          },
          React.createElement(
            'div',
            {
              style: {
                width: '240px',
                fontSize: '14px',
                color: '#374151',
              },
            },
            item.attribute
          ),
          React.createElement(
            'div',
            {
              style: {
                width: `${Math.max(40, (item.value / maxValue) * 560)}px`,
                height: '20px',
                borderRadius: '8px',
                background: fillColor,
              },
            }
          ),
          React.createElement(
            'div',
            {
              style: {
                width: '100px',
                fontSize: '13px',
                color: '#111827',
                fontWeight: 600,
              },
            },
            `DI ${item.value.toFixed(2)}`
          )
        );
      })
    )
  );
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function sectionHtml(title, body) {
  return `
    <section class="section">
      <h2>${escapeHtml(title)}</h2>
      ${body}
    </section>
  `;
}

function buildAnonymizedHtml(payload) {
  const summary = payload.anonymizedSummary || {};
  const findings = payload.riskIndicators || {};
  const regulations = findings.regulationMappings || [];
  const dataBias = findings.dataBiasFindings || [];
  const proxyWarnings = findings.proxyWarnings || [];
  const laundering = findings.featureLaundering || [];
  const intersections = findings.intersectionalFindings || [];
  const auditTrail = payload.auditTrail || [];

  const regsHtml = regulations.map((item) => `
    <tr>
      <td>${escapeHtml(item.regulation)}</td>
      <td>${escapeHtml(item.clause)}</td>
      <td>${escapeHtml(item.compliance_risk)}</td>
      <td>${escapeHtml(item.triggered_by)}</td>
    </tr>
  `).join('');

  const biasRows = dataBias.map((item) => `
    <tr>
      <td>${escapeHtml(item.attribute)}</td>
      <td>${escapeHtml(item.severity)}</td>
      <td>${escapeHtml(item.disparateImpact)}</td>
      <td>${escapeHtml(item.statisticalParityDifference)}</td>
    </tr>
  `).join('');

  const trailRows = auditTrail.map((step) => `
    <tr>
      <td>${escapeHtml(step.step)}</td>
      <td>${escapeHtml(step.status)}</td>
      <td>${escapeHtml(step.updatedAt || '')}</td>
    </tr>
  `).join('');

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>VisionAI Anonymized Report</title>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; color: #111827; margin: 0; padding: 0; background: #f8fafc; }
          .page { width: 100%; box-sizing: border-box; padding: 28px 34px; }
          .cover { border: 1px solid #e5e7eb; border-radius: 16px; background: #ffffff; padding: 20px; }
          .cover h1 { margin: 0; font-size: 28px; }
          .muted { color: #4b5563; font-size: 13px; }
          .chip { display: inline-block; margin-top: 10px; padding: 8px 12px; border-radius: 999px; background: #1f2937; color: white; font-size: 12px; }
          .section { margin-top: 20px; background: white; border-radius: 14px; border: 1px solid #e5e7eb; padding: 14px 16px; }
          .section h2 { margin: 0 0 10px 0; font-size: 19px; }
          table { width: 100%; border-collapse: collapse; margin-top: 6px; }
          th, td { border: 1px solid #e5e7eb; padding: 8px; font-size: 12px; text-align: left; }
          th { background: #f9fafb; }
          .disclaimer { margin-top: 12px; font-size: 11px; color: #6b7280; }
          .footer { margin-top: 20px; padding: 10px; background: #f3f4f6; border-radius: 10px; font-size: 11px; color: #374151; }
          .break { page-break-after: always; }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="cover">
            <h1>Anonymized Fairness Report</h1>
            <p class="muted">Organization: Company A</p>
            <p class="muted">Reference: ${escapeHtml(payload.auditRef)}</p>
            <p class="muted">Generated: ${escapeHtml(payload.generatedAt)}</p>
            <div class="chip">Fairness ${escapeHtml(summary.fairnessScore)} / 100 | Grade ${escapeHtml(summary.letterGrade)}</div>
            <p class="disclaimer">${escapeHtml(payload.note)}</p>
          </div>

          ${sectionHtml('Statistical Summary', `
            <p class="muted">Domain: ${escapeHtml(summary.domain)} | Jurisdiction: ${escapeHtml(summary.jurisdiction)}</p>
            <p class="muted">Audit status: ${escapeHtml(summary.status)} | Audit date: ${escapeHtml(summary.createdAt)}</p>
            <table>
              <thead><tr><th>Attribute</th><th>Severity</th><th>DI</th><th>SPD</th></tr></thead>
              <tbody>${biasRows || '<tr><td colspan="4">No data-bias findings present.</td></tr>'}</tbody>
            </table>
          `)}

          ${sectionHtml('Compliance Indicators', `
            <table>
              <thead><tr><th>Regulation</th><th>Clause</th><th>Risk</th><th>Triggered By</th></tr></thead>
              <tbody>${regsHtml || '<tr><td colspan="4">No regulation mappings were triggered.</td></tr>'}</tbody>
            </table>
            <p class="muted">Proxy warnings: ${escapeHtml(proxyWarnings.length)} | Feature laundering flags: ${escapeHtml(laundering.length)} | Intersectional findings: ${escapeHtml(intersections.length)}</p>
          `)}

          <div class="break"></div>

          ${sectionHtml('Audit Trail', `
            <table>
              <thead><tr><th>Step</th><th>Status</th><th>Timestamp</th></tr></thead>
              <tbody>${trailRows || '<tr><td colspan="3">No pipeline trail available.</td></tr>'}</tbody>
            </table>
          `)}

          <div class="footer">
            Integrity Token (SHA-256): ${escapeHtml(payload.integrityTokenSha256 || 'N/A')}<br />
            This report was generated by VisionAI's automated fairness audit system. Organization identity has been anonymized per whistleblower protection principles.
          </div>
        </div>
      </body>
    </html>
  `;
}

async function buildHtml(payload, chartPngDataUri) {
  if (payload.reportType === 'AnonymizedWhistleblowerExport') {
    return buildAnonymizedHtml(payload);
  }

  const cover = payload.cover || {};
  const summary = payload.executiveSummary || {};
  const dataAnalysis = payload.dataAnalysis || {};
  const modelAnalysis = payload.modelAnalysis || {};
  const legal = payload.legalCompliance || [];
  const appendix = payload.appendix || {};

  const findingItems = (summary.topFindings || []).map((item) => `
    <li>
      <strong>${escapeHtml(item.title)}</strong> (${escapeHtml(item.severity)}): ${escapeHtml(item.detail)}
    </li>
  `).join('');

  const dataRows = Object.entries(dataAnalysis).map(([attribute, result]) => {
    const metrics = result.metrics || {};
    return `
      <tr>
        <td>${escapeHtml(attribute)}</td>
        <td>${escapeHtml(result.severity)}</td>
        <td>${escapeHtml(metrics.disparate_impact)}</td>
        <td>${escapeHtml(metrics.statistical_parity_difference)}</td>
      </tr>
    `;
  }).join('');

  const modelRows = Object.entries(modelAnalysis)
    .filter(([key]) => key !== '_equalized_odds')
    .map(([attribute, result]) => `
      <tr>
        <td>${escapeHtml(attribute)}</td>
        <td>${escapeHtml(result.max_flip_rate)}</td>
        <td>${escapeHtml(result.mean_flip_rate)}</td>
        <td>${escapeHtml(result.verdict)}</td>
      </tr>
    `)
    .join('');

  const legalCards = legal.map((item) => `
    <div class="legal-card">
      <h4>${escapeHtml(item.regulation)}</h4>
      <p><strong>Clause:</strong> ${escapeHtml(item.clause)}</p>
      <p><strong>Risk:</strong> ${escapeHtml(item.compliance_risk)}</p>
      <p><strong>Triggered by:</strong> ${escapeHtml(item.triggered_by)}</p>
      <p><strong>Mitigation:</strong> ${escapeHtml(item.recommended_mitigation)}</p>
    </div>
  `).join('');

  const recommendations = (payload.recommendations || []).map((item) => `<li>${escapeHtml(item)}</li>`).join('');

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>VisionAI Audit Report</title>
        <style>
          body {
            font-family: 'Segoe UI', Arial, sans-serif;
            color: #111827;
            margin: 0;
            padding: 0;
            background: #f8fafc;
          }
          .page {
            width: 100%;
            box-sizing: border-box;
            padding: 28px 34px;
          }
          .cover {
            background: linear-gradient(180deg, #eef2ff, #ffffff);
            border: 1px solid #dbeafe;
            border-radius: 16px;
            padding: 20px;
          }
          .cover h1 {
            margin: 0;
            font-size: 28px;
          }
          .muted {
            color: #4b5563;
            font-size: 13px;
          }
          .score-chip {
            display: inline-block;
            margin-top: 10px;
            padding: 8px 12px;
            border-radius: 999px;
            background: #111827;
            color: white;
            font-weight: 600;
            font-size: 13px;
          }
          .section {
            margin-top: 20px;
            background: white;
            border-radius: 14px;
            border: 1px solid #e5e7eb;
            padding: 14px 16px;
          }
          .section h2 {
            margin: 0 0 10px 0;
            font-size: 19px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 6px;
          }
          th, td {
            border: 1px solid #e5e7eb;
            padding: 8px;
            font-size: 12px;
            text-align: left;
          }
          th {
            background: #f9fafb;
          }
          ul {
            margin: 0;
            padding-left: 18px;
          }
          li {
            margin: 4px 0;
            font-size: 13px;
          }
          .legal-grid {
            display: grid;
            gap: 8px;
          }
          .legal-card {
            border: 1px solid #e5e7eb;
            border-radius: 10px;
            padding: 8px 10px;
            background: #ffffff;
          }
          .legal-card h4 {
            margin: 0 0 6px 0;
            font-size: 14px;
          }
          .legal-card p {
            margin: 2px 0;
            font-size: 12px;
          }
          .break {
            page-break-after: always;
          }
          .footnote {
            margin-top: 14px;
            font-size: 11px;
            color: #6b7280;
          }
          img.chart {
            width: 100%;
            border: 1px solid #e5e7eb;
            border-radius: 12px;
            margin-top: 8px;
          }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="cover">
            <h1>VisionAI Audit Report</h1>
            <p class="muted">Audit ID: ${escapeHtml(payload.auditId)}</p>
            <p class="muted">Audit Name: ${escapeHtml(cover.auditName)}</p>
            <p class="muted">Domain: ${escapeHtml(cover.domain)} | Jurisdiction: ${escapeHtml(cover.jurisdiction)}</p>
            <p class="muted">Created: ${escapeHtml(cover.createdAt)} | Generated: ${escapeHtml(payload.generatedAt)}</p>
            <div class="score-chip">Fairness ${escapeHtml(cover.fairnessScore)} / 100 | Grade ${escapeHtml(cover.letterGrade)}</div>
            <p class="footnote">Disclaimer: This report contains statistical fairness findings and compliance risk indicators. It is not legal advice.</p>
          </div>

          ${sectionHtml('Executive Summary', `
            <p class="muted">Status: ${escapeHtml(summary.status)} | Rows: ${escapeHtml(summary.rowCount)} | Columns: ${escapeHtml(summary.columnCount)}</p>
            <p class="muted">Fairness Score: ${escapeHtml(summary.fairnessScore)} | Letter Grade: ${escapeHtml(summary.letterGrade)}</p>
            <h3>Top Findings</h3>
            <ul>${findingItems}</ul>
          `)}

          ${sectionHtml('Data Analysis', `
            <table>
              <thead><tr><th>Attribute</th><th>Severity</th><th>DI</th><th>SPD</th></tr></thead>
              <tbody>${dataRows || '<tr><td colspan="4">No data bias findings.</td></tr>'}</tbody>
            </table>
            <img class="chart" src="${chartPngDataUri}" alt="Data analysis chart" />
          `)}

          ${sectionHtml('Model Analysis', `
            <table>
              <thead><tr><th>Attribute</th><th>Max Flip Rate</th><th>Mean Flip Rate</th><th>Verdict</th></tr></thead>
              <tbody>${modelRows || '<tr><td colspan="4">No model findings.</td></tr>'}</tbody>
            </table>
          `)}

          <div class="break"></div>

          ${sectionHtml('Legal and Compliance', `
            <div class="legal-grid">${legalCards || '<p class="muted">No compliance mappings were triggered.</p>'}</div>
          `)}

          ${sectionHtml('Recommendations', `
            <ul>${recommendations}</ul>
          `)}

          ${sectionHtml('Technical Appendix', `
            <p class="muted">Label Column: ${escapeHtml(appendix.labelCol)}</p>
            <p class="muted">Positive Label: ${escapeHtml(appendix.positiveLabel)}</p>
            <p class="muted">Protected Attributes: ${escapeHtml((appendix.protectedCols || []).join(', '))}</p>
            <p class="muted">Threshold: ${escapeHtml(appendix.threshold)}</p>
          `)}
        </div>
      </body>
    </html>
  `;
}

async function renderChartPngDataUri(payload) {
  const fontData = await findFontBuffer();
  const chartData = buildChartData(payload);
  const element = buildChartElement(chartData);

  const svg = await satori(element, {
    width: 1020,
    height: 300,
    fonts: [
      {
        name: 'VisionFont',
        data: fontData,
        weight: 400,
        style: 'normal',
      },
    ],
  });

  const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
  return `data:image/png;base64,${pngBuffer.toString('base64')}`;
}

async function main() {
  const inputPath = getArg('--input');
  const outputPath = getArg('--output');

  if (!inputPath || !outputPath) {
    throw new Error('Usage: node pdf_export.js --input <payload.json> --output <report.pdf>');
  }

  const payloadRaw = await fs.readFile(inputPath, 'utf-8');
  const payload = JSON.parse(payloadRaw);

  const chartPngDataUri = await renderChartPngDataUri(payload);
  const html = await buildHtml(payload, chartPngDataUri);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.pdf({
      path: outputPath,
      format: 'A4',
      printBackground: true,
      margin: {
        top: '16mm',
        right: '12mm',
        bottom: '16mm',
        left: '12mm',
      },
    });
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  const msg = error?.stack || error?.message || String(error);
  console.error(msg);
  process.exit(1);
});
