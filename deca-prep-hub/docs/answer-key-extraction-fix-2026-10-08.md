# Answer-key extraction repair — October 8, 2026

## Failure and repair

Vercel's runtime error cluster recorded three failures on `/api/admin/exam-keys/[id]/extract`: `Failed to load external module pdf-parse ... ReferenceError: DOMMatrix is not defined`, on deployment `dpl_9TNfic9fWBo4Xn3ERDnutGbGYGdg` (commit `761943f`). The parser crashed during module initialization, before reading the PDF or reaching the route's error handler. Full local node_modules installations hid this deployment failure.

The text reader now initializes `pdf-parse/worker` before importing the parser, installs its real canvas globals, and explicitly configures its embedded worker. Canvas is a pinned production dependency, and the extraction route's trace explicitly includes its native binaries and worker assets. Initialization failures are caught and allow the second reader to try the same uploaded file.

Two free local readers (`pdf-parse` and `pdf2json`) decode the printed key separately. Exactly questions 1–100 and valid answer letters are required. If both readers succeed, their answers must match question by question. Conflicts block the preview rather than selecting an answer. If only one succeeds, the preview clearly asks for comparison with the PDF before saving. Extraction never writes answer keys.

The parser accepts EXAM–KEY, EXAM KEY, and ANSWER KEY headings, numbered explanation keys, compact tables, split number/letter lines, and punctuation without following whitespace. It does not solve questions or guess answers. No AI service or API credentials are used.

Scanned/image-only PDFs, encrypted/corrupt files, incomplete keys, and PDFs with no official key cannot be guaranteed automatic extraction. They return an actionable message and retain manual entry/paste. Two readers are a cross-check, not a mathematical guarantee of correctness; reviewing the official key remains the publication step.

## Verification

- Expanded local corpus: 220 exam-file copies across 22 folders / 50 distinct PDFs. Both readers agreed on all 100 answers and matched independently pinned pdfplumber answer hashes. Seven reference blueprints were rejected.
- All 10 currently uploaded Entrepreneurship exams: both readers agreed on all answers. The additional `1313_ENTRE_T_B25.pdf` was independently read with pdfplumber and added as the 50th pinned PDF hash. The read-only uploaded audit changed no files or keys.
- Local production HTTP endpoint: all 10 uploaded exams returned 100 matching answers, checked against the independent hashes. Anonymous/student extraction requests were denied, and the saved-answer count stayed unchanged. Temporary advisor/student accounts were removed.
- Nine parser/cross-check/readiness/pagination tests passed; four browser answer-key workflow tests passed, including the cross-check notice, conflict rejection without publication, preview without save, manual edits, partial keys, and mobile themes.
- Build, lint, TypeScript, and deployment-trace checks passed. The trace contains both readers, the canvas module, its native binary, and the PDF worker.

Relevant primary documentation: [pdf-parse deployment troubleshooting](https://github.com/mehmet-kozan/pdf-parse/blob/main/docs/troubleshooting.md), [pdf2json API](https://github.com/modesty/pdf2json), and the installed Next.js output tracing guide in `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/output.md`.
