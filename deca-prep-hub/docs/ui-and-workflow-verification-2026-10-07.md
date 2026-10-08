# UI and workflow verification — October 7–8, 2026

## Design direction and research

The interface uses compact document rows, restrained burgundy accents, warm light surfaces, charcoal dark surfaces, and consistent controls. Student navigation remains Practice, Roleplays, Exams, Reference, History & scores, and Settings. Management tools remain restricted to admins/advisors.

- [IBM Carbon data tables](https://carbondesignsystem.com/components/data-table/usage/): separate filters and global actions from individual row actions, reveal supplementary detail on demand, and show bulk actions after selection. This informed the compact approval queue and metadata review workflow.
- [USWDS collections](https://designsystem.digital.gov/components/collection/): use a clear linked title and limited metadata for related documents; larger catalogs belong in searchable indexes. This informed the practice home and student library rows.
- [GOV.UK file upload](https://design-system.service.gov.uk/components/file-upload/) and [error summaries](https://design-system.service.gov.uk/components/error-summary/): explain failures beside the affected input/file and make recovery specific. Successful uploads and failed uploads remain distinguishable so retries do not repeat completed work.
- [W3C text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) and [target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html): normal text needs at least 4.5:1 contrast; targets need adequate size or spacing. Primary controls use 40–44px heights, semantic theme colors, and visible keyboard focus. This is a design requirement, not a claim of a complete WCAG audit.

The shared shell now has a narrower sidebar, a skip link, visible mobile sign-out, and automatic positioning of the active mobile navigation item. Resource detail pages consolidate repeated metadata/actions. The exam answer sheet uses compact question rows and a native review dialog; existing answer selection, clearing, unanswered warnings, and submission behavior are retained.

## Student browser checks

Run `npm run test:browser` against port 3103. The final suite passed all 10 tests against the local production build on Next.js 16.3.8, including five student tests, two admin upload/approval tests, and three answer-key tests. Without an existing server, Playwright starts a development server automatically.

These tests intercept authentication, Supabase, and application API requests with controlled fixtures. They verify browser behavior and request/response integration; they do **not** prove live database authorization, extraction accuracy, or production grading. No production data is written.

Covered flows:

1. `/dashboard` → `/exams` → exam answer sheet: choose/change/clear answers, review unanswered questions, cancel using Escape while retaining answers, submit, open the saved result, and find it again through `/analytics`. The taking response fixture contains no correct answers.
2. `/roleplays` → practice: start/pause/reset the preparation timer, change duration, enter response/reflection/partner feedback, select confidence, save, read the saved attempt, reopen it from history, edit it, cancel deletion using Escape, and delete it.
3. `/reference`: search with no results, clear filters, open document details/PDF link, confirm absence of practice actions, and confirm students cannot open resource management. Pending resources are absent from student libraries.
4. Practice home, Reference, and exam answer sheet at 390px and 1440px in light and dark themes: no document overflow and theme persistence across navigation.
5. Settings: save a cluster preference, reload to confirm persistence, and sign out. A loading race was fixed by disabling the cluster selector until the profile is available and while saving.

An additional local fixture check covered cluster filtering, an exam without a ready answer key, and resource detail rendering in both sizes/themes. Screenshots were visually inspected; a native progress-bar appearance issue and low-contrast dark form borders were corrected. Mobile navigation was adjusted to keep the current destination visible.

Generated screenshots are local test artifacts, recreated by the suite:

- [Mobile exam, light](../test-results/student-flows-student-scre-f8269--and-desktop-in-both-themes/exam-390-light.png)
- [Desktop reference, dark](../test-results/student-flows-student-scre-f8269--and-desktop-in-both-themes/reference-1440-dark.png)
- [Desktop home, light](../test-results/student-flows-student-scre-f8269--and-desktop-in-both-themes/home-1440-light.png)

## Admin browser checks

- Upload two PDFs individually, simulate a plain-text 413 failure for one, retain only the failed draft, and retry it. Exactly three requests are made, with one file per request.
- Clear an inferred event, change a document to Reference, edit its title, and save metadata.
- Preserve explicitly cleared event/year/area fields in the server upload normalizer. Browser fixtures use the same normalizer, so they verify saved values rather than merely echoing the submitted draft. Event clearing also clears its inferred name/category. Filename year detection handles underscores.
- Check pending/approved totals while approving a single document and a selected group. Approved references appear in the student Reference library; roleplays do not.
- Read a PDF key into a preview without saving, apply 100 answers, correct an answer, save, remove a row, and save a partial key. Duplicate pasted question numbers cannot be applied.
- Inspect the answer-key editor at 390px in both themes. Escape closes it and returns keyboard focus to its Manage key button.

## Answer-key accuracy

`npm run verify:answer-key-corpus` passed for **218 exam files across 22 folders, containing 49 distinct PDFs**. Every distinct PDF produced exactly questions 1–100, and every answer matched an independent pdfplumber reader. Seven reference blueprint copies were correctly rejected as answer keys. ENT and ETDM contain nine exams each; the other 20 event folders contain ten each.

The pinned SHA-256 fixtures are in `scripts/fixtures/exam-key-corpus.json`; they contain file/answer hashes, not the PDFs. `scripts/verify-answer-key-baseline.py` independently rechecks the hashes with pdfplumber. Missing corpus files are not downloaded or silently replaced. Unsupported/scanned PDFs retain the manual-entry path; no answers are inferred or generated with AI.

Seven `test:answer-keys` regressions passed: printed-key-only parsing, formatting variation, missing/duplicate/invalid answer rejection, non-exam rejection, exactly 100 contiguous questions for readiness, and pagination beyond both 1,000 answer rows and 1,000 exams.

## Backend and final checks

The live local-app-to-Supabase test passed on October 7 (02:26 UTC October 8) and again on October 8 against the final production build. It used temporary school advisor/student accounts and an actual Marketing exam PDF. It checked upload and approval for all three resource types, reference storage paths, pending visibility, extraction permission checks, preview without publication, saving 99 answers blocking grading, adding question 100 enabling grading, scores of 100/100, 1/100 and 0/100, unanswered rows, duplicate-submission rejection, attempt ownership, private roleplay audio playback, signed reference PDFs, and profile role protection. The final run also verified directly in the database that explicitly cleared event/name/category/year fields remain null despite filename inference. All fixtures were removed afterward.

Final production-build checks on October 8:

- `npm run build`, `npm run lint`, `npx tsc --noEmit`, and `git diff --check`: passed.
- `npm run test:browser`: 10 passed against `next start`.
- After the final metadata fix and rebuild, both admin browser tests passed again against `next start`, including the saved null event/year values.
- `npm run smoke:routes`: 35 route checks passed, including removed features and unauthenticated API guards. This is route coverage, not a substitute for authenticated tests.
- `npm run test:answer-keys`: seven passed; full local exam corpus passed after dependency updates.
- `npm run test:resource-upload`: four passed; `test:resource-metadata`: four passed; `test:resource-listing`: one passed, including 1,203-row approval and reference libraries.
- `npm run test:pdf-text -- <local-exam.pdf>`: passed with the actual MCS 2017 exam.
- `npm run check:db`: all six active tables passed.
- Final SQL counts: zero resources, keys, exam attempts, exam answers, roleplay attempts, or storage objects; six original profiles; zero temporary verification users.
- Next.js and its ESLint configuration were updated to 16.3.8, and compatible dependency fixes applied. `npm audit --omit=dev` reports zero vulnerabilities. The full audit still reports five inherited development-tool findings in the braces → micromatch → fast-glob → Next ESLint chain; its proposed automatic fix is an incompatible downgrade to Next ESLint 14, so it was not applied.

### Resolved connection issue

Supabase Auth account endpoints temporarily returned `ECONNRESET` independently of the app while REST database reads worked. The user confirmed no known school filter, VPN, or proxy was active. The endpoints subsequently returned successful responses without changing authentication settings, keys, or the local network configuration. The complete production-build backend test then passed, and a final SQL check confirmed zero content/storage rows, six original profiles, and zero temporary verification users. The cause of the transient connection resets is unknown; the account-based backend verification is complete. Google OAuth's authorization entry returned its expected redirect, but a real Google consent/callback flow was not exercised by the temporary password-account tests.
