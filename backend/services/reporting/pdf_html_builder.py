"""
HTML template generation for PDF reports.
Replaces Node.js/React implementation.
"""

import base64
import requests
from typing import Optional


def _resolve_logo_data_uri(url: str) -> str:
    """
    Fetch remote logo and convert to data URI.
    
    Args:
        url: Logo URL (http/https) or existing data URI
    
    Returns:
        Data URI string or empty string if fetch fails
    """
    if not url or url.startswith('data:image/'):
        return url
    
    try:
        response = requests.get(url, timeout=5)
        response.raise_for_status()
        content_type = response.headers.get('content-type', 'image/png')
        base64_data = base64.b64encode(response.content).decode('utf-8')
        return f"data:{content_type};base64,{base64_data}"
    except Exception:
        return ""


def _escape_html(text: str) -> str:
    """Escape HTML special characters."""
    if not text:
        return ""
    return (str(text)
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;")
            .replace("'", "&#39;"))


def build_standard_html(payload: dict, chart_image_bytes: bytes) -> str:
    """
    Build HTML for standard audit PDF.
    
    Args:
        payload: Audit data payload from _build_pdf_payload()
        chart_image_bytes: PNG chart image bytes
    
    Returns:
        Complete HTML document string
    """
    branding = payload.get("branding", {})
    cover = payload.get("cover", {})
    summary = payload.get("executiveSummary", {})
    data_analysis = payload.get("dataAnalysis", {})
    model_analysis = payload.get("modelAnalysis", {})
    legal = payload.get("legalCompliance", [])
    recommendations = payload.get("recommendations", [])
    appendix = payload.get("appendix", {})
    
    # Convert chart to base64 data URI
    chart_data_uri = f"data:image/png;base64,{base64.b64encode(chart_image_bytes).decode('utf-8')}"
    
    # Resolve logo
    logo_uri = _resolve_logo_data_uri(branding.get("orgLogoUrl", ""))
    logo_html = f'<img src="{logo_uri}" style="max-height: 60px; max-width: 200px;" />' if logo_uri else ""
    
    # Build findings HTML
    findings_html = ""
    for finding in summary.get("topFindings", [])[:3]:
        severity_color = {
            "CRITICAL": "#dc2626",
            "HIGH": "#ea580c",
            "PASS": "#16a34a"
        }.get(finding.get("severity", "PASS"), "#16a34a")
        findings_html += f"""
        <div style="margin-bottom: 15px; padding: 12px; border-left: 4px solid {severity_color}; background: #f9fafb;">
            <div style="font-weight: bold; color: {severity_color};">{_escape_html(finding.get('title', ''))}</div>
            <div style="font-size: 13px; color: #6b7280; margin-top: 5px;">{_escape_html(finding.get('detail', ''))}</div>
        </div>
        """
    
    # Build data bias HTML
    data_bias_html = ""
    for attr, result in data_analysis.items():
        severity = result.get("severity", "PASS")
        severity_color = {"CRITICAL": "#dc2626", "HIGH": "#ea580c", "PASS": "#16a34a"}.get(severity, "#16a34a")
        data_bias_html += f"""
        <tr>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">{_escape_html(attr)}</td>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">{result.get('disparate_impact', 0):.3f}</td>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">{result.get('statistical_parity_difference', 0):.3f}</td>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; color: {severity_color}; font-weight: bold;">{severity}</td>
        </tr>
        """
    
    # Build model bias HTML
    model_bias_html = ""
    for attr, result in model_analysis.items():
        if attr == "_equalized_odds":
            continue
        model_bias_html += f"""
        <tr>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">{_escape_html(attr)}</td>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">{result.get('max_flip_rate', 0):.3f}</td>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">{result.get('flip_sensitivity', 0):.3f}</td>
        </tr>
        """
    
    # Build regulations HTML
    regulations_html = ""
    for reg in legal:
        status_color = {"PASS": "#16a34a", "REVIEW": "#ea580c", "FAIL": "#dc2626"}.get(reg.get("status", "PASS"), "#6b7280")
        regulations_html += f"""
        <tr>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">{_escape_html(reg.get('regulation', ''))}</td>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; color: {status_color}; font-weight: bold;">{reg.get('status', 'PASS')}</td>
        </tr>
        """
    
    # Build recommendations HTML
    recommendations_html = "".join([f"<li style='margin-bottom: 8px;'>{_escape_html(rec)}</li>" for rec in recommendations])
    
    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <style>
            @page {{
                size: A4;
                margin: 16mm 12mm;
            }}
            body {{
                font-family: Arial, Helvetica, sans-serif;
                font-size: 14px;
                line-height: 1.6;
                color: #1f2937;
            }}
            h1 {{ font-size: 24px; margin-top: 0; color: #111827; }}
            h2 {{ font-size: 20px; margin-top: 30px; color: #111827; page-break-after: avoid; }}
            h3 {{ font-size: 16px; margin-top: 20px; color: #374151; }}
            table {{ width: 100%; border-collapse: collapse; margin-top: 15px; }}
            th {{ background: #f3f4f6; padding: 10px; text-align: left; font-weight: bold; border-bottom: 2px solid #d1d5db; }}
            .page-break {{ page-break-after: always; }}
            .header {{ text-align: center; margin-bottom: 40px; }}
            .score-box {{ display: inline-block; padding: 20px 40px; background: #f0fdf4; border: 2px solid #16a34a; border-radius: 8px; margin: 20px 0; }}
            .score-large {{ font-size: 48px; font-weight: bold; color: #16a34a; }}
        </style>
    </head>
    <body>
        <!-- Cover Page -->
        <div class="header">
            {logo_html}
            <h1 style="margin-top: 40px;">Fairness Audit Report</h1>
            <h2 style="color: #6b7280; font-weight: normal;">{_escape_html(cover.get('auditName', ''))}</h2>
            <div class="score-box">
                <div class="score-large">{cover.get('fairnessScore', 0):.1f}</div>
                <div style="font-size: 18px; color: #6b7280;">Grade: {_escape_html(cover.get('letterGrade', '-'))}</div>
            </div>
            <div style="margin-top: 30px; color: #6b7280;">
                <div><strong>Domain:</strong> {_escape_html(cover.get('domain', '-'))}</div>
                <div><strong>Jurisdiction:</strong> {_escape_html(cover.get('jurisdiction', 'Global'))}</div>
                <div><strong>Generated:</strong> {_escape_html(payload.get('generatedAt', ''))}</div>
                <div><strong>Organization:</strong> {_escape_html(branding.get('orgName', 'Organization'))}</div>
            </div>
        </div>
        
        <div class="page-break"></div>
        
        <!-- Executive Summary -->
        <h2>Executive Summary</h2>
        <p><strong>Status:</strong> {_escape_html(summary.get('status', '-'))}</p>
        <p><strong>Dataset:</strong> {summary.get('rowCount', 0):,} rows × {summary.get('columnCount', 0)} columns</p>
        <p><strong>Fairness Score:</strong> {summary.get('fairnessScore', 0):.1f} (Grade: {_escape_html(summary.get('letterGrade', '-'))})</p>
        
        <h3>Top Findings</h3>
        {findings_html}
        
        <h3>Disparate Impact Snapshot</h3>
        <img src="{chart_data_uri}" style="max-width: 100%; height: auto; margin: 20px 0;" />
        
        <div class="page-break"></div>
        
        <!-- Data Analysis -->
        <h2>Data Bias Analysis</h2>
        <table>
            <thead>
                <tr>
                    <th>Attribute</th>
                    <th>Disparate Impact</th>
                    <th>Statistical Parity Diff</th>
                    <th>Severity</th>
                </tr>
            </thead>
            <tbody>
                {data_bias_html}
            </tbody>
        </table>
        
        <div class="page-break"></div>
        
        <!-- Model Analysis -->
        <h2>Model Bias Analysis</h2>
        <table>
            <thead>
                <tr>
                    <th>Attribute</th>
                    <th>Max Flip Rate</th>
                    <th>Flip Sensitivity</th>
                </tr>
            </thead>
            <tbody>
                {model_bias_html}
            </tbody>
        </table>
        
        <div class="page-break"></div>
        
        <!-- Legal Compliance -->
        <h2>Legal & Compliance</h2>
        <table>
            <thead>
                <tr>
                    <th>Regulation</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>
                {regulations_html}
            </tbody>
        </table>
        
        <h2 style="margin-top: 40px;">Recommendations</h2>
        <ul>
            {recommendations_html}
        </ul>
        
        <div class="page-break"></div>
        
        <!-- Technical Appendix -->
        <h2>Technical Appendix</h2>
        <p><strong>Label Column:</strong> {_escape_html(str(appendix.get('labelCol', '-')))}</p>
        <p><strong>Positive Label:</strong> {_escape_html(str(appendix.get('positiveLabel', '-')))}</p>
        <p><strong>Protected Attributes:</strong> {_escape_html(', '.join(appendix.get('protectedCols', [])))}</p>
        <p><strong>Threshold:</strong> {appendix.get('threshold', 0.5)}</p>
    </body>
    </html>
    """
    
    return html


def build_anonymized_html(payload: dict, chart_image_bytes: bytes) -> str:
    """
    Build HTML for anonymized whistleblower PDF.
    
    Args:
        payload: Anonymized audit data payload
        chart_image_bytes: PNG chart image bytes
    
    Returns:
        Complete HTML document string
    """
    # For anonymized reports, use similar structure but with anonymization markers
    branding = payload.get("branding", {})
    
    # Convert chart to base64 data URI
    chart_data_uri = f"data:image/png;base64,{base64.b64encode(chart_image_bytes).decode('utf-8')}"
    
    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <style>
            @page {{
                size: A4;
                margin: 16mm 12mm;
            }}
            body {{
                font-family: Arial, Helvetica, sans-serif;
                font-size: 14px;
                line-height: 1.6;
                color: #1f2937;
            }}
            h1 {{ font-size: 24px; margin-top: 0; color: #111827; }}
            h2 {{ font-size: 20px; margin-top: 30px; color: #111827; }}
            .watermark {{ text-align: center; color: #dc2626; font-weight: bold; font-size: 18px; margin: 30px 0; }}
        </style>
    </head>
    <body>
        <div class="watermark">⚠️ ANONYMIZED WHISTLEBLOWER REPORT ⚠️</div>
        <h1 style="text-align: center;">Anonymized Fairness Audit Report</h1>
        <p style="text-align: center; color: #6b7280;">
            Generated: {_escape_html(payload.get('generatedAt', ''))}<br>
            Organization: {_escape_html(branding.get('orgName', 'REDACTED'))}<br>
            Stakeholder: {_escape_html(branding.get('stakeholder', 'Whistleblower'))}
        </p>
        
        <h2>Audit Summary</h2>
        <p>This is an anonymized export of a fairness audit. Sensitive organizational details have been redacted.</p>
        
        <h2>Disparate Impact Analysis</h2>
        <img src="{chart_data_uri}" style="max-width: 100%; height: auto; margin: 20px 0;" />
        
        <h2>Integrity Token</h2>
        <p style="font-family: monospace; background: #f3f4f6; padding: 15px; word-break: break-all;">
            {_escape_html(payload.get('integrityToken', 'N/A'))}
        </p>
        
        <p style="margin-top: 40px; font-size: 12px; color: #6b7280;">
            This report has been anonymized for whistleblower protection. 
            The integrity token above can be used to verify authenticity.
        </p>
    </body>
    </html>
    """
    
    return html
