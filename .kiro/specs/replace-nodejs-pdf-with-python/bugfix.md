# Bugfix Requirements Document

## Introduction

The VisionAI backend currently uses a Node.js/Puppeteer-based PDF generation system that fails with Chrome dependency errors in production environments. When users attempt to download PDF audit reports, the system crashes with the error: "Could not find Chrome (ver. 147.0.7727.56)". This bug prevents users from exporting critical audit reports, which is a core feature of the application.

The root cause is the dependency on Puppeteer's Chrome binaries, which are not reliably available in all deployment environments. Since VisionAI is a Python backend application, this Node.js dependency introduces unnecessary complexity and fragility.

This bugfix will replace the Node.js/Puppeteer PDF generation with a pure Python solution, eliminating the Chrome dependency and ensuring reliable PDF generation across all deployment environments.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a user requests a PDF export via `/api/audits/{audit_id}/export/pdf` THEN the system invokes a Node.js subprocess that fails with "Could not find Chrome" error

1.2 WHEN the Puppeteer script attempts to launch a browser THEN the system crashes because Chrome binaries are not installed or the cache path is misconfigured

1.3 WHEN the PDF generation fails THEN the user receives a 500 error response and cannot download their audit report

1.4 WHEN deploying to production environments THEN the Node.js dependencies (puppeteer, satori, sharp, react) require additional installation steps and Chrome binary management

### Expected Behavior (Correct)

2.1 WHEN a user requests a PDF export via `/api/audits/{audit_id}/export/pdf` THEN the system SHALL generate the PDF using a pure Python library without requiring Node.js or Chrome

2.2 WHEN the PDF generation process executes THEN the system SHALL complete successfully without external browser dependencies

2.3 WHEN the PDF generation completes THEN the user SHALL receive a properly formatted PDF file with all audit data, charts, and branding

2.4 WHEN deploying to production environments THEN the system SHALL only require Python dependencies that can be installed via pip/requirements.txt

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a user requests a standard audit PDF export THEN the system SHALL CONTINUE TO include all sections: cover page, executive summary, data analysis, model analysis, legal compliance, recommendations, and technical appendix

3.2 WHEN a user requests an anonymized whistleblower PDF export via `/api/audits/{audit_id}/export/anon` THEN the system SHALL CONTINUE TO generate the anonymized report format with organization identity protection

3.3 WHEN generating PDFs with organization branding THEN the system SHALL CONTINUE TO include custom logos, organization names, stakeholder labels, and product branding

3.4 WHEN the PDF includes data visualization charts THEN the system SHALL CONTINUE TO render the disparate impact snapshot chart with severity-based color coding

3.5 WHEN the PDF includes compliance data THEN the system SHALL CONTINUE TO display regulation mappings, proxy warnings, feature laundering flags, and intersectional findings

3.6 WHEN the PDF generation encounters an error THEN the system SHALL CONTINUE TO return a 500 HTTP error with a descriptive error message

3.7 WHEN the backend API endpoint `/api/audits/{audit_id}/export/pdf` is called THEN the system SHALL CONTINUE TO return the PDF as `application/pdf` with appropriate Content-Disposition headers

3.8 WHEN the frontend calls `exportPDF(auditId)` THEN the system SHALL CONTINUE TO trigger a browser download with filename format `audit-{auditId}.pdf`
