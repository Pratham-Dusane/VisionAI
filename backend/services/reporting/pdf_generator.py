import json
import subprocess
import tempfile
from datetime import datetime
from pathlib import Path


NODE_PROJECT_DIR = Path(__file__).resolve().parent / "node_pdf"
NODE_SCRIPT_PATH = NODE_PROJECT_DIR / "pdf_export.js"


def _build_pdf_payload(audit_id: str, audit: dict) -> dict:
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

    return {
        "auditId": audit_id,
        "generatedAt": datetime.utcnow().isoformat(),
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


def generate_audit_pdf_bytes(audit_id: str, audit: dict) -> bytes:
    if not NODE_SCRIPT_PATH.exists():
        raise RuntimeError(
            "Puppeteer PDF script not found. Expected at services/reporting/node_pdf/pdf_export.js"
        )

    payload = _build_pdf_payload(audit_id, audit)

    with tempfile.TemporaryDirectory(prefix="visionai_pdf_") as tmp_dir:
        tmp_path = Path(tmp_dir)
        input_path = tmp_path / "payload.json"
        output_path = tmp_path / "report.pdf"
        input_path.write_text(json.dumps(payload), encoding="utf-8")

        cmd = [
            "node",
            str(NODE_SCRIPT_PATH),
            "--input",
            str(input_path),
            "--output",
            str(output_path),
        ]

        proc = subprocess.run(
            cmd,
            cwd=str(NODE_PROJECT_DIR),
            capture_output=True,
            text=True,
            check=False,
        )

        if proc.returncode != 0:
            stderr = (proc.stderr or "").strip()
            stdout = (proc.stdout or "").strip()
            detail = stderr or stdout or "Unknown Node/Puppeteer error"
            raise RuntimeError(f"Puppeteer PDF generation failed: {detail}")

        if not output_path.exists():
            raise RuntimeError("Puppeteer PDF generation completed without producing output file")

        return output_path.read_bytes()
