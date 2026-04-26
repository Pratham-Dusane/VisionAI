import json
from datetime import datetime
from pathlib import Path
from io import BytesIO
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, PageBreak
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from services.reporting.audit_serializer import serialize_anonymized_export
from services.reporting.pdf_chart_generator import generate_disparate_impact_chart


def _build_pdf_payload(audit_id: str, audit: dict, branding: dict | None = None) -> dict:
    severity = audit.get("severity", {})
    data_bias = audit.get("dataBias", {})
    model_bias = audit.get("modelBias", {}) or {}
    regulations = audit.get("regulationMap", [])

    top_findings = []
    for attr, result in data_bias.items():
        if result.get("severity") in {"CRITICAL", "HIGH"}:
            top_findings.append({
                "title": f"Data bias in {attr}",
                "detail": result.get("explanation", ""),
                "severity": result.get("severity"),
            })

    for attr, result in model_bias.items():
        if attr == "_equalized_odds":
            continue
        max_flip = result.get("max_flip_rate", 0)
        if max_flip > 0.1:
            top_findings.append({
                "title": f"Model sensitivity for {attr}",
                "detail": f"Max flip rate: {round(max_flip * 100, 1)}%",
                "severity": "HIGH" if max_flip <= 0.25 else "CRITICAL",
            })

    if not top_findings:
        top_findings.append({
            "title": "No critical findings",
            "detail": "No CRITICAL or HIGH findings were detected for this audit.",
            "severity": "PASS",
        })

    branding_payload = {
        "orgName": (branding or {}).get("orgName") or "Organization",
        "orgLogoUrl": (branding or {}).get("orgLogoUrl") or "",
        "stakeholder": (branding or {}).get("stakeholder") or "Technical Stakeholder",
        "productName": "VisionAI",
    }

    return {
        "auditId": audit_id,
        "generatedAt": datetime.utcnow().isoformat(),
        "branding": branding_payload,
        "cover": {
            "auditName": audit.get("name", "-"),
            "domain": audit.get("domain", "-"),
            "jurisdiction": audit.get("jurisdiction", "Global"),
            "fairnessScore": audit.get("fairnessScore", 0),
            "letterGrade": audit.get("letterGrade", "-"),
            "createdAt": audit.get("createdAt"),
        },
        "executiveSummary": {
            "status": audit.get("status", "-"),
            "rowCount": audit.get("rowCount", 0),
            "columnCount": audit.get("columnCount", 0),
            "fairnessScore": severity.get("fairness_score", audit.get("fairnessScore", 0)),
            "letterGrade": severity.get("letter_grade", audit.get("letterGrade", "-")),
            "topFindings": top_findings[:3],
            "penalties": severity.get("penalties", []),
        },
        "dataAnalysis": data_bias,
        "modelAnalysis": model_bias,
        "legalCompliance": regulations,
        "recommendations": [
            "Prioritize remediation for CRITICAL and HIGH findings.",
            "Re-run audit after mitigation and compare fairness trends.",
            "Maintain evidence for legal and compliance review.",
        ],
        "appendix": {
            "labelCol": audit.get("labelCol"),
            "positiveLabel": audit.get("positiveLabel"),
            "protectedCols": audit.get("protectedCols", []),
            "threshold": audit.get("threshold"),
            "pipeline": audit.get("pipeline", {}),
        },
    }


def _generate_pdf_with_reportlab(payload: dict, chart_image_bytes: bytes) -> bytes:
    """Generate PDF using ReportLab."""
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, leftMargin=12*mm, rightMargin=12*mm, topMargin=16*mm, bottomMargin=16*mm)
    
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle('CustomTitle', parent=styles['Heading1'], fontSize=24, textColor=colors.HexColor('#111827'), alignment=TA_CENTER)
    heading_style = ParagraphStyle('CustomHeading', parent=styles['Heading2'], fontSize=20, textColor=colors.HexColor('#111827'), spaceAfter=12)
    normal_style = styles['Normal']
    
    story = []
    branding = payload.get("branding", {})
    cover = payload.get("cover", {})
    summary = payload.get("executiveSummary", {})
    
    # Cover page
    story.append(Paragraph(f"<b>{branding.get('orgName', 'Organization')}</b>", normal_style))
    story.append(Spacer(1, 20*mm))
    story.append(Paragraph("Fairness Audit Report", title_style))
    story.append(Spacer(1, 10*mm))
    story.append(Paragraph(f"<b>{cover.get('auditName', '')}</b>", ParagraphStyle('Subtitle', parent=normal_style, fontSize=16, alignment=TA_CENTER)))
    story.append(Spacer(1, 20*mm))
    
    # Score box
    score_text = f"<para align=center><font size=48 color='#16a34a'><b>{cover.get('fairnessScore', 0):.1f}</b></font><br/><font size=14>Grade: {cover.get('letterGrade', '-')}</font></para>"
    story.append(Paragraph(score_text, normal_style))
    story.append(Spacer(1, 20*mm))
    
    # Metadata
    story.append(Paragraph(f"<b>Domain:</b> {cover.get('domain', '-')}", normal_style))
    story.append(Paragraph(f"<b>Jurisdiction:</b> {cover.get('jurisdiction', 'Global')}", normal_style))
    story.append(Paragraph(f"<b>Generated:</b> {payload.get('generatedAt', '')}", normal_style))
    story.append(PageBreak())
    
    # Executive Summary
    story.append(Paragraph("Executive Summary", heading_style))
    story.append(Paragraph(f"<b>Status:</b> {summary.get('status', '-')}", normal_style))
    story.append(Paragraph(f"<b>Dataset:</b> {summary.get('rowCount', 0):,} rows × {summary.get('columnCount', 0)} columns", normal_style))
    story.append(Paragraph(f"<b>Fairness Score:</b> {summary.get('fairnessScore', 0):.1f} (Grade: {summary.get('letterGrade', '-')})", normal_style))
    story.append(Spacer(1, 10*mm))
    
    # Top findings
    story.append(Paragraph("<b>Top Findings</b>", ParagraphStyle('SubHeading', parent=normal_style, fontSize=14, spaceAfter=6)))
    for finding in summary.get("topFindings", [])[:3]:
        severity_color = {"CRITICAL": "#dc2626", "HIGH": "#ea580c", "PASS": "#16a34a"}.get(finding.get("severity", "PASS"), "#16a34a")
        story.append(Paragraph(f"<font color='{severity_color}'><b>{finding.get('title', '')}</b></font>", normal_style))
        story.append(Paragraph(finding.get('detail', ''), normal_style))
        story.append(Spacer(1, 5*mm))
    
    # Chart
    story.append(Paragraph("<b>Disparate Impact Snapshot</b>", ParagraphStyle('SubHeading', parent=normal_style, fontSize=14, spaceAfter=6)))
    img = Image(BytesIO(chart_image_bytes), width=180*mm, height=80*mm)
    story.append(img)
    story.append(PageBreak())
    
    # Data Bias Analysis
    story.append(Paragraph("Data Bias Analysis", heading_style))
    data_analysis = payload.get("dataAnalysis", {})
    if data_analysis:
        data_table = [["Attribute", "Disparate Impact", "SPD", "Severity"]]
        for attr, result in data_analysis.items():
            data_table.append([
                attr,
                f"{result.get('disparate_impact', 0):.3f}",
                f"{result.get('statistical_parity_difference', 0):.3f}",
                result.get('severity', 'PASS')
            ])
        t = Table(data_table, colWidths=[50*mm, 40*mm, 40*mm, 30*mm])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f3f4f6')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.black),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 12),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#e5e7eb'))
        ]))
        story.append(t)
    story.append(PageBreak())
    
    # Model Bias Analysis
    story.append(Paragraph("Model Bias Analysis", heading_style))
    model_analysis = payload.get("modelAnalysis", {})
    if model_analysis:
        model_table = [["Attribute", "Max Flip Rate", "Flip Sensitivity"]]
        for attr, result in model_analysis.items():
            if attr == "_equalized_odds":
                continue
            model_table.append([
                attr,
                f"{result.get('max_flip_rate', 0):.3f}",
                f"{result.get('flip_sensitivity', 0):.3f}"
            ])
        t = Table(model_table, colWidths=[60*mm, 50*mm, 50*mm])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f3f4f6')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.black),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 12),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#e5e7eb'))
        ]))
        story.append(t)
    story.append(PageBreak())
    
    # Legal Compliance
    story.append(Paragraph("Legal & Compliance", heading_style))
    legal = payload.get("legalCompliance", [])
    if legal:
        legal_table = [["Regulation", "Status"]]
        for reg in legal:
            legal_table.append([reg.get('regulation', ''), reg.get('status', 'PASS')])
        t = Table(legal_table, colWidths=[100*mm, 60*mm])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f3f4f6')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.black),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 12),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#e5e7eb'))
        ]))
        story.append(t)
    
    story.append(Spacer(1, 10*mm))
    story.append(Paragraph("<b>Recommendations</b>", heading_style))
    for rec in payload.get("recommendations", []):
        story.append(Paragraph(f"• {rec}", normal_style))
    
    doc.build(story)
    buffer.seek(0)
    return buffer.read()


def generate_audit_pdf_bytes(audit_id: str, audit: dict, branding: dict | None = None) -> bytes:
    """Generate standard audit PDF using Python (ReportLab + Matplotlib)."""
    payload = _build_pdf_payload(audit_id, audit, branding=branding)
    
    # Prepare chart data
    data_bias = audit.get("dataBias", {})
    chart_data = []
    for attr, result in data_bias.items():
        chart_data.append({
            "attribute": attr,
            "value": result.get("disparate_impact", 0),
            "severity": result.get("severity", "PASS"),
        })
    
    chart_image_bytes = generate_disparate_impact_chart(chart_data)
    return _generate_pdf_with_reportlab(payload, chart_image_bytes)


def generate_anonymized_audit_pdf_bytes(audit_id: str, audit: dict, branding: dict | None = None) -> bytes:
    """Generate anonymized audit PDF using Python (ReportLab + Matplotlib)."""
    payload = serialize_anonymized_export(audit_id, audit)
    payload["branding"] = {
        "orgName": (branding or {}).get("orgName") or "Organization",
        "orgLogoUrl": (branding or {}).get("orgLogoUrl") or "",
        "stakeholder": (branding or {}).get("stakeholder") or "Whistleblower Stakeholder",
        "productName": "VisionAI",
    }
    
    data_bias = audit.get("dataBias", {})
    chart_data = []
    for attr, result in data_bias.items():
        chart_data.append({
            "attribute": attr,
            "value": result.get("disparate_impact", 0),
            "severity": result.get("severity", "PASS"),
        })
    
    chart_image_bytes = generate_disparate_impact_chart(chart_data)
    return _generate_pdf_with_reportlab(payload, chart_image_bytes)
