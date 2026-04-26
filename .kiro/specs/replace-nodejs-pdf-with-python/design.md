# Replace Node.js PDF with Python Bugfix Design

## Overview

The VisionAI backend currently uses a Node.js/Puppeteer-based PDF generation system that fails with Chrome dependency errors ("Could not find Chrome (ver. 147.0.7727.56)") in production environments. This bugfix replaces the Node.js/Puppeteer dependency with a pure Python solution using WeasyPrint for HTML-to-PDF conversion and Matplotlib for chart generation.

The fix eliminates the external Node.js subprocess, Chrome binary dependencies, and complex font management, replacing them with Python-native libraries that integrate seamlessly with the existing FastAPI backend. The solution maintains full API compatibility and preserves all existing PDF features including branding, charts, and both standard and anonymized report formats.

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug - when PDF generation is requested and Puppeteer fails to find Chrome binaries
- **Property (P)**: The desired behavior when PDF generation is requested - PDFs should be generated successfully using pure Python libraries without external dependencies
- **Preservation**: All existing PDF content, formatting, branding, API endpoints, and report types must remain unchanged
- **WeasyPrint**: Python library for HTML-to-PDF conversion using CSS Paged Media
- **Matplotlib**: Python library for generating chart images (PNG) from data
- **Puppeteer**: Node.js library that controls headless Chrome (current implementation, to be removed)
- **Satori**: React-based SVG renderer used in current implementation (to be removed)
- **pdf_generator.py**: The Python module in `backend/services/reporting/pdf_generator.py` that orchestrates PDF generation
- **pdf_export.js**: The Node.js script in `backend/services/reporting/node_pdf/pdf_export.js` that uses Puppeteer (to be removed)

## Bug Details

### Bug Condition

The bug manifests when a user requests a PDF export and the system attempts to launch Puppeteer's headless Chrome browser. The `_run_node_pdf` function in `pdf_generator.py` spawns a Node.js subprocess that executes `pdf_export.js`, which calls `puppeteer.launch()`. This fails because Chrome binaries are either not installed, not in the expected cache path, or incompatible with the deployment environment.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type PDFExportRequest
  OUTPUT: boolean
  
  RETURN input.endpoint IN ['/api/audits/{audit_id}/export/pdf', '/api/audits/{audit_id}/export/anon']
         AND chromeBinariesNotAvailable()
         AND puppeteerLaunchAttempted()
END FUNCTION
```

### Examples

- **Standard PDF Export**: User clicks "Export PDF" button → Backend calls `generate_audit_pdf_bytes()` → `_run_node_pdf()` spawns Node subprocess → `puppeteer.launch()` fails with "Could not find Chrome (ver. 147.0.7727.56)" → User receives 500 error
- **Anonymized PDF Export**: User clicks "Export Anonymized Report" → Backend calls `generate_anonymized_audit_pdf_bytes()` → Same Puppeteer failure → User receives 500 error
- **Production Deployment**: Application deployed to cloud environment without Chrome installed → All PDF exports fail immediately → Feature is completely broken
- **Edge Case - Font Loading**: Even if Chrome is available, Satori font loading may fail if `VISIONAI_PDF_FONT_PATH` is misconfigured → PDF generation fails with "No usable font found for Satori rendering"

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- All PDF content sections must remain identical: cover page, executive summary, data analysis, model analysis, legal compliance, recommendations, technical appendix
- Anonymized whistleblower reports must continue to include organization anonymization, integrity tokens, and all risk indicators
- Organization branding (logos, names, stakeholder labels, product name) must display correctly
- Disparate impact snapshot chart must render with severity-based color coding (CRITICAL=red, HIGH=orange, PASS=green)
- API endpoints `/api/audits/{audit_id}/export/pdf` and `/api/audits/{audit_id}/export/anon` must continue to return `application/pdf` with appropriate Content-Disposition headers
- Frontend `exportPDF(auditId)` function must continue to trigger browser downloads with filename format `audit-{auditId}.pdf`
- Error handling must continue to return 500 HTTP errors with descriptive messages when PDF generation fails

**Scope:**
All inputs that do NOT involve PDF generation should be completely unaffected by this fix. This includes:
- All other audit endpoints (create, list, retrieve, delete)
- JSON export functionality
- Legal export functionality
- Frontend UI rendering and interactions
- Database operations and Firebase integration

## Hypothesized Root Cause

Based on the bug description and code analysis, the root causes are:

1. **Chrome Binary Dependency**: Puppeteer requires Chrome/Chromium binaries to be installed and accessible. In production environments (Docker containers, cloud platforms), these binaries are often missing or misconfigured. The error "Could not find Chrome (ver. 147.0.7727.56)" indicates Puppeteer cannot locate the expected Chrome version in its cache directory.

2. **Node.js Subprocess Complexity**: The current architecture spawns a Node.js subprocess from Python (`subprocess.run(["node", ...])`), which introduces multiple failure points: Node.js must be installed, npm dependencies must be present, environment variables must be configured, and inter-process communication must work correctly.

3. **Font Management Issues**: The Satori library requires TrueType fonts for SVG rendering. The `findFontBuffer()` function searches multiple paths, but if none are found, the entire PDF generation fails. This is fragile across different operating systems and deployment environments.

4. **Architectural Mismatch**: VisionAI is a Python/FastAPI backend, but PDF generation relies on a Node.js ecosystem (Puppeteer, Satori, Sharp, React). This creates deployment complexity, increases container size, and introduces version compatibility issues between Python and Node.js dependencies.

## Correctness Properties

Property 1: Bug Condition - PDF Generation Without Chrome

_For any_ PDF export request where the bug condition holds (Puppeteer would fail to find Chrome), the fixed PDF generation function SHALL successfully generate the PDF using WeasyPrint and Matplotlib, returning a valid PDF byte stream without requiring Chrome binaries or Node.js.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4**

Property 2: Preservation - PDF Content and Formatting

_For any_ PDF export request (standard or anonymized), the fixed PDF generation function SHALL produce a PDF with identical content structure, visual formatting, branding elements, and chart rendering as the original Puppeteer-based implementation, preserving all sections and data presentation.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct, we will replace the Node.js/Puppeteer implementation with a pure Python solution.

**Primary Changes:**

**File**: `backend/services/reporting/pdf_generator.py`

**Function**: `_run_node_pdf()` → Replace with `_generate_pdf_with_weasyprint()`

**Specific Changes**:

1. **Remove Node.js Subprocess Call**: Delete `_run_node_pdf()` function that spawns Node.js subprocess. Remove all references to `NODE_PROJECT_DIR` and `NODE_SCRIPT_PATH`.

2. **Add WeasyPrint HTML-to-PDF Conversion**: Create new function `_generate_pdf_with_weasyprint(html: str) -> bytes` that uses WeasyPrint to convert HTML to PDF. WeasyPrint supports CSS Paged Media for page breaks, margins, and print-specific styling.

3. **Add Matplotlib Chart Generation**: Create new function `_generate_chart_image(data: list[dict]) -> bytes` that uses Matplotlib to generate the disparate impact snapshot chart as a PNG image. This replaces the Satori/React/Sharp pipeline.

4. **Refactor HTML Generation**: Extract HTML generation logic from `pdf_export.js` into Python. Create functions `_build_standard_html()` and `_build_anonymized_html()` that generate the same HTML structure but embed the Matplotlib chart as a base64 data URI.

5. **Update Public API Functions**: Modify `generate_audit_pdf_bytes()` and `generate_anonymized_audit_pdf_bytes()` to call the new Python-based PDF generation pipeline instead of `_run_node_pdf()`.

**Secondary Changes:**

**File**: `backend/requirements.txt`

**Changes**: Add Python dependencies:
- `weasyprint>=60.0` - HTML-to-PDF conversion with CSS support
- `matplotlib>=3.8.0` - Chart generation
- `pillow>=10.0.0` - Image processing (required by WeasyPrint)

**File**: `backend/services/reporting/node_pdf/` (entire directory)

**Changes**: Mark for deletion after Python implementation is verified. This includes:
- `pdf_export.js` - Node.js script (no longer needed)
- `package.json` - Node.js dependencies (no longer needed)
- `package-lock.json` - Dependency lock file (no longer needed)
- `node_modules/` - Installed Node.js packages (no longer needed)

**File**: `backend/Dockerfile` (if exists)

**Changes**: Remove Node.js installation steps and npm install commands. The Docker image should only need Python and pip.

**File**: `.github/workflows/deploy-backend.yml` (if exists)

**Changes**: Remove Node.js setup steps from CI/CD pipeline. Only Python environment setup is required.

### Implementation Details

**Chart Generation with Matplotlib:**

The current implementation uses Satori (React-based SVG renderer) + Sharp (image processor) to generate chart PNGs. The replacement uses Matplotlib's horizontal bar chart with custom styling:

```python
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from io import BytesIO

def _generate_chart_image(data: list[dict]) -> bytes:
    """
    Generate disparate impact snapshot chart as PNG.
    
    Args:
        data: List of dicts with keys: attribute, value (DI score), severity
    
    Returns:
        PNG image bytes
    """
    fig, ax = plt.subplots(figsize=(10, 3))
    
    attributes = [item['attribute'] for item in data]
    values = [item['value'] for item in data]
    colors = [
        '#dc2626' if item['severity'] == 'CRITICAL' else
        '#ea580c' if item['severity'] == 'HIGH' else
        '#16a34a'
        for item in data
    ]
    
    ax.barh(attributes, values, color=colors)
    ax.set_xlabel('Disparate Impact')
    ax.set_title('Disparate Impact Snapshot')
    
    buf = BytesIO()
    plt.savefig(buf, format='png', dpi=150, bbox_inches='tight')
    plt.close(fig)
    buf.seek(0)
    return buf.read()
```

**HTML-to-PDF with WeasyPrint:**

WeasyPrint converts HTML+CSS to PDF using the CSS Paged Media specification. It supports:
- `@page` rules for margins and page size
- `page-break-after`, `page-break-before` for pagination
- Embedded images via data URIs or file paths
- Web fonts via `@font-face` (optional, system fonts work by default)

```python
from weasyprint import HTML, CSS
from io import BytesIO

def _generate_pdf_with_weasyprint(html: str) -> bytes:
    """
    Convert HTML to PDF using WeasyPrint.
    
    Args:
        html: Complete HTML document string
    
    Returns:
        PDF bytes
    """
    pdf_bytes = HTML(string=html).write_pdf()
    return pdf_bytes
```

**Logo Handling:**

The current implementation fetches remote logos and converts them to data URIs. This logic will be preserved in Python:

```python
import requests
import base64

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
```

**CSS Styling:**

The HTML templates will include inline CSS that matches the current Puppeteer output. WeasyPrint supports most CSS 2.1 and some CSS 3 features. Key considerations:
- Use `@page { size: A4; margin: 16mm 12mm; }` for page setup
- Use `page-break-after: always;` for explicit page breaks
- Flexbox is supported for layout
- Gradients are supported for backgrounds

### File Structure

**New Python Module Structure:**

```
backend/services/reporting/
├── __init__.py
├── pdf_generator.py          # Main API (refactored)
├── pdf_html_builder.py       # NEW: HTML template generation
├── pdf_chart_generator.py    # NEW: Matplotlib chart generation
├── audit_serializer.py       # Unchanged
└── node_pdf/                 # TO BE DELETED after verification
    ├── pdf_export.js
    ├── package.json
    └── node_modules/
```

**Module Responsibilities:**

- `pdf_generator.py`: Public API functions (`generate_audit_pdf_bytes`, `generate_anonymized_audit_pdf_bytes`), orchestrates PDF generation pipeline
- `pdf_html_builder.py`: HTML template generation (`build_standard_html`, `build_anonymized_html`), logo resolution, HTML escaping
- `pdf_chart_generator.py`: Matplotlib chart generation (`generate_disparate_impact_chart`), chart data preparation

### API Compatibility

**No changes to public API:**

- `generate_audit_pdf_bytes(audit_id: str, audit: dict, branding: dict | None = None) -> bytes`
- `generate_anonymized_audit_pdf_bytes(audit_id: str, audit: dict, branding: dict | None = None) -> bytes`

**No changes to HTTP endpoints:**

- `GET /api/audits/{audit_id}/export/pdf` → Returns `application/pdf`
- `GET /api/audits/{audit_id}/export/anon` → Returns `application/pdf`

**No changes to frontend integration:**

- `exportPDF(auditId)` function continues to work without modification
- Browser download behavior remains identical

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code (Puppeteer failures), then verify the fix works correctly (Python PDF generation succeeds) and preserves existing behavior (PDF content matches).

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm that Puppeteer fails when Chrome binaries are unavailable. If we cannot reproduce the failure, we will need to re-hypothesize.

**Test Plan**: Write tests that simulate PDF export requests in an environment without Chrome installed. Run these tests on the UNFIXED code to observe Puppeteer failures and confirm the root cause.

**Test Cases**:
1. **Standard PDF Export Without Chrome**: Call `generate_audit_pdf_bytes()` in environment without Chrome binaries (will fail on unfixed code with "Could not find Chrome" error)
2. **Anonymized PDF Export Without Chrome**: Call `generate_anonymized_audit_pdf_bytes()` in environment without Chrome binaries (will fail on unfixed code)
3. **Font Path Misconfiguration**: Call PDF generation with invalid `VISIONAI_PDF_FONT_PATH` (may fail on unfixed code with "No usable font found")
4. **Node.js Not Installed**: Call PDF generation in environment without Node.js (will fail on unfixed code with subprocess error)

**Expected Counterexamples**:
- `RuntimeError: Puppeteer PDF generation failed: Could not find Chrome (ver. 147.0.7727.56)`
- `RuntimeError: Puppeteer PDF generation failed: No usable font found for Satori rendering`
- `FileNotFoundError: [Errno 2] No such file or directory: 'node'`

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds (Puppeteer would fail), the fixed function produces the expected behavior (successful PDF generation).

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := generate_audit_pdf_bytes_fixed(input.audit_id, input.audit, input.branding)
  ASSERT result is valid PDF bytes
  ASSERT len(result) > 0
  ASSERT result.startswith(b'%PDF-')
  ASSERT no Chrome dependency required
  ASSERT no Node.js subprocess spawned
END FOR
```

**Test Cases**:
1. **Standard PDF Generation**: Call `generate_audit_pdf_bytes()` with sample audit data → Assert PDF bytes returned, no errors
2. **Anonymized PDF Generation**: Call `generate_anonymized_audit_pdf_bytes()` with sample audit data → Assert PDF bytes returned, no errors
3. **PDF with Branding**: Call with custom logo URL and organization name → Assert logo embedded correctly
4. **PDF with Charts**: Call with data bias findings → Assert chart image embedded correctly
5. **Environment Without Chrome**: Run all tests in Docker container without Chrome → Assert all pass

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold (i.e., all PDF export requests), the fixed function produces PDFs with the same content, structure, and visual appearance as the original function.

**Pseudocode:**
```
FOR ALL input WHERE PDF_export_requested(input) DO
  original_pdf := generate_with_puppeteer(input)  # If Chrome available
  fixed_pdf := generate_with_weasyprint(input)
  
  ASSERT fixed_pdf contains all sections from original_pdf
  ASSERT fixed_pdf contains same data values
  ASSERT fixed_pdf contains same branding elements
  ASSERT fixed_pdf chart visually matches original chart
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across different audit configurations
- It catches edge cases like missing data, empty findings, or unusual branding
- It provides strong guarantees that content is preserved for all valid audit inputs

**Test Plan**: Generate PDFs with both Puppeteer (if Chrome available) and WeasyPrint implementations, then compare content extraction to verify preservation.

**Test Cases**:
1. **Content Preservation**: Extract text from both PDFs → Assert all sections present (cover, summary, data analysis, model analysis, legal, recommendations, appendix)
2. **Data Preservation**: Parse tables from both PDFs → Assert all data values match (DI scores, SPD values, flip rates, regulation mappings)
3. **Branding Preservation**: Verify organization name, stakeholder label, product name appear in both PDFs
4. **Chart Preservation**: Verify disparate impact chart present in both PDFs with correct attributes and severity colors
5. **Anonymized Report Preservation**: Verify anonymized format includes integrity token, audit trail, risk indicators
6. **API Endpoint Preservation**: Call `/api/audits/{audit_id}/export/pdf` → Assert response headers and content-type unchanged
7. **Frontend Integration Preservation**: Trigger `exportPDF(auditId)` → Assert browser download behavior unchanged

### Unit Tests

- Test `_generate_chart_image()` with various data inputs (empty, single attribute, multiple attributes, different severities)
- Test `_build_standard_html()` with various audit payloads (minimal data, full data, missing optional fields)
- Test `_build_anonymized_html()` with anonymized export payloads
- Test `_resolve_logo_data_uri()` with different URL formats (http, https, data URI, invalid URL)
- Test `_generate_pdf_with_weasyprint()` with sample HTML strings
- Test error handling when WeasyPrint fails (invalid HTML, missing images)

### Property-Based Tests

- Generate random audit data structures and verify PDF generation succeeds for all valid inputs
- Generate random branding configurations (with/without logos, various organization names) and verify PDFs render correctly
- Generate random data bias findings and verify charts render with correct colors and values
- Test that all PDFs start with `%PDF-` magic bytes and are valid PDF format
- Test that PDF generation time is reasonable (< 5 seconds for typical audits)

### Integration Tests

- Test full PDF export flow: Create audit → Run analysis → Export PDF → Verify PDF content
- Test anonymized export flow: Create audit → Export anonymized PDF → Verify anonymization and integrity token
- Test PDF export with real Firebase data (if test environment available)
- Test PDF export in Docker container without Chrome installed
- Test concurrent PDF generation requests (verify no race conditions)
- Test PDF generation with large audits (many attributes, many findings)
- Test error handling when audit data is malformed or incomplete
