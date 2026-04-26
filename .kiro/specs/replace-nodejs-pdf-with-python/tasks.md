# Implementation Plan

## Overview

This task list implements the bugfix to replace Node.js/Puppeteer PDF generation with pure Python (WeasyPrint + Matplotlib). The workflow follows the exploratory bugfix methodology: explore the bug with tests BEFORE fixing, preserve existing behavior, then implement the fix with validation.

---

## Tasks

- [-] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - PDF Generation Fails Without Chrome
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists (Puppeteer Chrome dependency failures)
  - **Scoped PBT Approach**: For deterministic bugs, scope the property to the concrete failing case(s) to ensure reproducibility
  - Test that `generate_audit_pdf_bytes()` and `generate_anonymized_audit_pdf_bytes()` fail when Chrome binaries are not available
  - Test implementation details from Bug Condition in design: `isBugCondition(input)` where `input.endpoint IN ['/api/audits/{audit_id}/export/pdf', '/api/audits/{audit_id}/export/anon'] AND chromeBinariesNotAvailable() AND puppeteerLaunchAttempted()`
  - The test assertions should match the Expected Behavior Properties from design: PDF generation should succeed without Chrome/Node.js dependencies
  - Create test file: `backend/tests/test_pdf_bug_condition.py`
  - Write property-based test that generates various audit payloads and attempts PDF generation
  - Scope property to cases where Chrome is unavailable (simulate by removing Chrome binaries or mocking Puppeteer failure)
  - Run test on UNFIXED code (current Puppeteer implementation)
  - **EXPECTED OUTCOME**: Test FAILS with errors like "Could not find Chrome (ver. 147.0.7727.56)" or "No such file or directory: 'node'"
  - Document counterexamples found to understand root cause (e.g., "generate_audit_pdf_bytes(audit_id='test-001', audit={...}) raises RuntimeError: Puppeteer PDF generation failed: Could not find Chrome")
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [~] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - PDF Content and Formatting Preserved
  - **IMPORTANT**: Follow observation-first methodology
  - Observe behavior on UNFIXED code for non-buggy inputs (when Chrome IS available, if possible in test environment)
  - Write property-based tests capturing observed behavior patterns from Preservation Requirements
  - Property-based testing generates many test cases for stronger guarantees
  - Create test file: `backend/tests/test_pdf_preservation.py`
  - Test that PDF contains all required sections: cover page, executive summary, data analysis, model analysis, legal compliance, recommendations, technical appendix (Requirement 3.1)
  - Test that anonymized PDF format includes organization anonymization, integrity tokens, and risk indicators (Requirement 3.2)
  - Test that PDF includes organization branding: custom logos, organization names, stakeholder labels, product branding (Requirement 3.3)
  - Test that PDF includes disparate impact snapshot chart with severity-based color coding (CRITICAL=red, HIGH=orange, PASS=green) (Requirement 3.4)
  - Test that PDF includes compliance data: regulation mappings, proxy warnings, feature laundering flags, intersectional findings (Requirement 3.5)
  - Test that API endpoints return correct HTTP headers: `application/pdf` with Content-Disposition (Requirement 3.7)
  - Test that frontend integration triggers browser download with filename format `audit-{auditId}.pdf` (Requirement 3.8)
  - Generate property-based tests with various audit configurations (minimal data, full data, missing optional fields, different severities)
  - If Chrome is available in test environment, run tests on UNFIXED code to capture baseline behavior
  - If Chrome is NOT available, document expected behavior based on design specifications
  - **EXPECTED OUTCOME**: Tests define the preservation contract (may skip execution on unfixed code if Chrome unavailable)
  - Mark task complete when tests are written and preservation contract is documented
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

- [ ] 3. Fix for Node.js/Puppeteer Chrome dependency

  - [~] 3.1 Add Python dependencies to requirements.txt
    - Add `weasyprint>=60.0` for HTML-to-PDF conversion with CSS Paged Media support
    - Add `matplotlib>=3.8.0` for chart generation (disparate impact snapshot)
    - Add `pillow>=10.0.0` for image processing (required by WeasyPrint)
    - Verify dependencies are compatible with existing packages
    - _Bug_Condition: isBugCondition(input) where input.endpoint IN ['/api/audits/{audit_id}/export/pdf', '/api/audits/{audit_id}/export/anon'] AND chromeBinariesNotAvailable()_
    - _Expected_Behavior: PDF generation succeeds using pure Python libraries without Chrome/Node.js_
    - _Preservation: All PDF content, formatting, branding, and API behavior preserved_
    - _Requirements: 2.1, 2.4_

  - [~] 3.2 Create pdf_chart_generator.py module
    - Create new file: `backend/services/reporting/pdf_chart_generator.py`
    - Implement `generate_disparate_impact_chart(data: list[dict]) -> bytes` function
    - Use Matplotlib to create horizontal bar chart with severity-based color coding
    - Colors: CRITICAL=#dc2626 (red), HIGH=#ea580c (orange), PASS=#16a34a (green)
    - Chart should match visual appearance of current Satori/React/Sharp implementation
    - Return PNG image bytes (150 DPI, tight bounding box)
    - Handle edge cases: empty data, single attribute, multiple attributes
    - _Bug_Condition: isBugCondition(input) where chromeBinariesNotAvailable()_
    - _Expected_Behavior: Chart generation succeeds without Node.js/Satori/Sharp dependencies_
    - _Preservation: Chart visual appearance matches original implementation (Requirement 3.4)_
    - _Requirements: 2.1, 2.2, 3.4_

  - [~] 3.3 Create pdf_html_builder.py module
    - Create new file: `backend/services/reporting/pdf_html_builder.py`
    - Implement `build_standard_html(payload: dict, chart_image_bytes: bytes) -> str` function
    - Implement `build_anonymized_html(payload: dict, chart_image_bytes: bytes) -> str` function
    - Implement `_resolve_logo_data_uri(url: str) -> str` helper function (fetch remote logos and convert to data URIs)
    - HTML templates should match structure from current `pdf_export.js` implementation
    - Embed chart image as base64 data URI: `data:image/png;base64,{base64_data}`
    - Include CSS styling with `@page` rules for A4 size and margins
    - Use `page-break-after: always;` for section breaks
    - Support organization branding: logos, names, stakeholder labels, product name
    - Handle missing optional fields gracefully (empty strings, default values)
    - _Bug_Condition: isBugCondition(input) where chromeBinariesNotAvailable()_
    - _Expected_Behavior: HTML generation succeeds without Node.js/React dependencies_
    - _Preservation: HTML structure and content match original implementation (Requirements 3.1, 3.2, 3.3, 3.5)_
    - _Requirements: 2.1, 2.2, 3.1, 3.2, 3.3, 3.5_

  - [~] 3.4 Refactor pdf_generator.py to use Python pipeline
    - Import new modules: `pdf_chart_generator`, `pdf_html_builder`
    - Create new function: `_generate_pdf_with_weasyprint(html: str) -> bytes`
    - Use WeasyPrint to convert HTML to PDF: `HTML(string=html).write_pdf()`
    - Refactor `generate_audit_pdf_bytes()` to use new pipeline:
      1. Build payload with `_build_pdf_payload()` (existing function)
      2. Generate chart image with `generate_disparate_impact_chart()`
      3. Build HTML with `build_standard_html()`
      4. Convert to PDF with `_generate_pdf_with_weasyprint()`
    - Refactor `generate_anonymized_audit_pdf_bytes()` to use new pipeline:
      1. Build payload with `serialize_anonymized_export()` (existing function)
      2. Generate chart image with `generate_disparate_impact_chart()`
      3. Build HTML with `build_anonymized_html()`
      4. Convert to PDF with `_generate_pdf_with_weasyprint()`
    - Keep `_run_node_pdf()` function temporarily for comparison testing (mark as deprecated)
    - Add error handling: catch WeasyPrint exceptions and return descriptive error messages
    - _Bug_Condition: isBugCondition(input) where chromeBinariesNotAvailable() AND puppeteerLaunchAttempted()_
    - _Expected_Behavior: expectedBehavior(result) where result is valid PDF bytes without Chrome/Node.js dependencies_
    - _Preservation: API compatibility preserved - same function signatures, same return types (Requirements 3.6, 3.7, 3.8)_
    - _Requirements: 2.1, 2.2, 2.3, 3.6, 3.7, 3.8_

  - [~] 3.5 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - PDF Generation Succeeds Without Chrome
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior
    - When this test passes, it confirms the expected behavior is satisfied
    - Run bug condition exploration test from step 1: `backend/tests/test_pdf_bug_condition.py`
    - Test should now PASS: `generate_audit_pdf_bytes()` and `generate_anonymized_audit_pdf_bytes()` succeed without Chrome
    - Verify PDF bytes are valid: start with `%PDF-` magic bytes, length > 0
    - Verify no Node.js subprocess is spawned (no calls to `subprocess.run(["node", ...])`)
    - Verify no Chrome dependency errors occur
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [~] 3.6 Verify preservation tests still pass
    - **Property 2: Preservation** - PDF Content and Formatting Preserved
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2: `backend/tests/test_pdf_preservation.py`
    - Verify all PDF sections present: cover, summary, data analysis, model analysis, legal, recommendations, appendix
    - Verify anonymized format includes organization anonymization and integrity tokens
    - Verify branding elements display correctly: logos, names, stakeholder labels
    - Verify disparate impact chart renders with correct severity colors
    - Verify compliance data displays correctly: regulation mappings, proxy warnings, feature laundering flags
    - Verify API endpoints return correct HTTP headers and content-type
    - Verify frontend integration triggers browser downloads with correct filename format
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all tests still pass after fix (no regressions)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

- [~] 4. Checkpoint - Ensure all tests pass
  - Run full test suite: `pytest backend/tests/test_pdf_bug_condition.py backend/tests/test_pdf_preservation.py`
  - Verify bug condition test passes (PDF generation succeeds without Chrome)
  - Verify preservation tests pass (all PDF content and formatting preserved)
  - Run integration tests if available (full PDF export flow with real audit data)
  - Test PDF generation in Docker container without Chrome installed
  - Test concurrent PDF generation requests (verify no race conditions)
  - Test PDF generation with large audits (many attributes, many findings)
  - If any tests fail, investigate root cause and fix before proceeding
  - Ensure all tests pass, ask the user if questions arise

- [~] 5. Clean up Node.js dependencies (AFTER verification)
  - **IMPORTANT**: Only proceed after all tests pass in task 4
  - Delete `_run_node_pdf()` function from `backend/services/reporting/pdf_generator.py`
  - Remove `NODE_PROJECT_DIR` and `NODE_SCRIPT_PATH` constants
  - Delete entire directory: `backend/services/reporting/node_pdf/` (includes pdf_export.js, package.json, package-lock.json, node_modules/)
  - Update `backend/Dockerfile` (if exists): Remove Node.js installation steps and npm install commands
  - Update `.github/workflows/deploy-backend.yml` (if exists): Remove Node.js setup steps from CI/CD pipeline
  - Verify application still works after cleanup: run tests again to confirm no regressions
  - _Requirements: 2.4_

---

## Notes

- **Bug Condition**: PDF generation fails when Chrome binaries are not available (Puppeteer dependency)
- **Expected Behavior**: PDF generation succeeds using pure Python libraries (WeasyPrint + Matplotlib)
- **Preservation**: All PDF content, formatting, branding, charts, and API behavior must remain unchanged
- **Testing Strategy**: Exploratory testing BEFORE fix (surface counterexamples), then fix validation and preservation checking
- **Property-Based Testing**: Recommended for preservation tests to generate many test cases and catch edge cases
- **API Compatibility**: No changes to public API functions or HTTP endpoints - frontend integration remains unchanged
