# OJR DECA Roleplay Preparation App Rebuild Plan

Rebuild plan for shifting DECA Prep Hub from a passive PDF resource library toward the OJR DECA Roleplay Preparation App direction: a structured, concept-centered DECA preparation platform.

## A. Current Architecture Summary

### What the app currently does well

- Provides a working Next.js App Router application with TypeScript and Tailwind CSS.
- Uses Supabase Auth with Google OAuth and an `@ojrsd.net` account restriction.
- Maintains `student`, `admin`, and `advisor` profile roles, with advisors currently treated as admin-equivalent through `isAdminRole()`.
- Stores uploaded and imported PDFs in Supabase Storage and exposes them through signed URLs instead of public links.
- Supports admin/advisor review of pending, approved, and rejected resources.
- Supports approved student libraries for roleplays and exams.
- Supports exam answer key entry, exam submission, server-side grading, result pages, and attempt analytics.
- Supports non-AI roleplay practice attempts, optional audio upload, attempt editing, attempt deletion, and basic roleplay practice analytics.
- Keeps sensitive operations behind server routes and avoids frontend use of `SUPABASE_SERVICE_ROLE_KEY`.
- Includes database health and route smoke-test scripts.

### Current pages and flows

Student-visible pages:

- `/dashboard`: profile, exam analytics, roleplay attempt summary, and next actions.
- `/learn`: guided learning pathway entry point. Shows learning-enabled/pilot events, with MCS as the recommended first active pathway.
- `/learn/[eventCode]`: event learning pathway page for enabled learning events.
- `/learn/[eventCode]/key-sets/[keySetId]`: approved key set concept list and progress.
- `/learn/[eventCode]/concepts/[conceptId]`: concept lesson and approved practice questions.
- `/roleplays`: approved roleplay resource library filtered from `resources`.
- `/exams`: approved exam resource library filtered from `resources`.
- `/resources`: resource review/library entry point.
- `/resources/[id]`: approved resource detail page with signed PDF access.
- `/exams/[id]/take`: answer entry for exams with saved answer keys.
- `/exams/attempts/[attemptId]`: graded exam result detail.
- `/roleplays/[id]/practice`: written roleplay practice attempt and optional audio recording.
- `/roleplays/attempts/[attemptId]`: saved roleplay attempt detail.
- `/analytics`: student analytics.
- `/calendar`: chapter calendar/countdown page.
- `/settings`: settings and theme-related controls.

Admin/advisor-visible pages:

- `/admin`: consolidated admin workspace linking to resource management, upload, AI review, exam keys, users/roles, and admin analytics.
- `/admin/upload`: upload one or more PDFs with metadata review before insert.
- `/admin/resources`: review, approve, reject, bulk approve/reject, edit metadata, and inspect developer details.
- `/admin/ai-review`: review AI extraction jobs and extracted draft content.
- `/admin/exam-keys`: create and edit answer keys for approved exam PDFs.
- `/admin/users`: list users and change roles while protecting final admin/advisor access.
- `/admin/analytics`: aggregate exam/resource/user analytics.

API routes:

- Auth: `/auth/callback`.
- Resource PDF signing/repair: `/api/resources/[id]/pdf`.
- Admin upload: `/api/admin/resources/upload`.
- Admin users: `/api/admin/users`, `/api/admin/users/[id]/role`.
- Analytics: `/api/analytics/student`, `/api/analytics/admin`.
- Exam taking/grading/results: `/api/exams/[id]/take`, `/api/exams/[id]/submit`, `/api/exams/attempts/[attemptId]`.
- Roleplay attempts/audio: `/api/roleplays/[id]/attempts`, `/api/roleplays/attempts/[attemptId]`, `/api/roleplays/attempts/[attemptId]/audio`.

### Current database tables

Known tables from checked-in types, migrations, and health checks:

- `profiles`: user profile and role rows tied to Supabase Auth users.
- `resources`: central PDF/resource table. It stores metadata such as title, type, cluster, event code/name/category, instructional area, year, approval status, original filename, storage path, detected text/import details, and performance indicator review state.
- `exam_answer_keys`: per-resource answer key rows for exam PDFs.
- `exam_attempts`: graded student exam submissions.
- `exam_attempt_answers`: per-question graded answers tied to an exam attempt.
- `roleplay_attempts`: student roleplay practice notes, optional audio path, transcript placeholders, AI feedback placeholders, scores, strengths/growth areas, confidence, and timestamps.

Important schema-source note: migrations for newer tables and columns are present, but the original `profiles` and `resources` table creation SQL is not represented in the current migration folder. Before Phase 1, capture or recreate the full baseline schema so future migrations have a reliable source of truth.

### Current Supabase Storage usage

- `resources`: PDF bucket used for resource uploads/imports. Files are addressed by object paths such as `roleplay/2025/...pdf` or `exam/2025/...pdf`.
- `roleplay-audio`: private bucket for optional roleplay attempt audio. Audio access is mediated through server API routes after ownership checks.

### Current auth and role model

- Users authenticate with Google through Supabase Auth.
- Only `@ojrsd.net` emails are allowed.
- `profiles.role` supports `student`, `admin`, and `advisor`.
- Admin/advisor management checks should use `isAdminRole(role)`.
- User-management routes use server-side Supabase access and avoid recursive profile RLS policies.

### Current admin capabilities

- Upload PDFs with metadata detection and pre-import review.
- Approve, reject, bulk approve/reject, and edit resource metadata.
- Review raw/developer resource details when needed.
- Create and edit exam answer keys.
- View aggregate analytics.
- Manage user roles while protecting the final admin-equivalent account.

### Current student capabilities

- Browse approved roleplay and exam PDFs.
- Open/download PDFs through signed URLs.
- Take exams when an answer key exists.
- Review graded exam results and analytics.
- Save roleplay practice responses, reflections, judge feedback, confidence ratings, and optional audio.
- Review and delete their own attempts.

## B. Current Limitations

The app behaves more like a passive PDF library than a structured learning tool because `resources` remains the center of the domain. PDFs are stored, categorized, approved, and opened, but they are not deeply converted into student learning content.

Current limitations:

- PDFs are stored and approved, but concepts, lessons, question banks, roleplay scenarios, rubrics, and performance indicators are not modeled as first-class learning records.
- Students browse approved resources passively and decide what to study on their own.
- Concept mastery is not central to the dashboard or learning flow.
- Roleplay attempts capture practice notes, reflections, and audio, but they do not yet drive structured improvement.
- Exam PDFs are not fully converted into reusable practice question banks; answer keys support grading, but question text and concept mapping are absent.
- Performance indicators exist only as reviewed/unreviewed arrays on resources and are not connected to lessons, questions, or mastery.
- There is no revision loop after AI or human feedback.
- Dashboards point to broad weak instructional areas, not specific concepts, key sets, or recommended next activities.
- AI placeholder columns exist on roleplay attempts, but no AI extraction, transcription, feedback, or grading workflow is implemented.

## C. Proposed Product Model

The OJR DECA Roleplay Preparation App direction should make student preparation feel like a guided event pathway instead of a file cabinet.

Target student flow:

Event Pathway -> Key Set -> Concept -> Quick Checks -> Scenario Lock -> Free Response -> AI Feedback -> Revision -> Mastery Update

Primary pilot:

- Marketing Communications Series (MCS).
- MCS should create the first full Marketing Cluster foundation because it overlaps with many marketing events while still being specific enough to build real lessons, scenario practice, and feedback loops.

Secondary pilot:

- Business Law and Ethics Team Decision Making (BLTDM).
- BLTDM provides contrast because it is a team decision-making event in the Business Management and Administration cluster and emphasizes law, ethics, contracts, liability, employment issues, and judgment-based decisions.

Important separation:

- MCS and BLTDM are pilot events for future learning reinforcement.
- Resource preparation should support a broader canonical DECA event catalog for uploaded roleplays, exams, answer keys, rubrics, and extracted content.
- Unknown or ambiguous resources should remain unmatched for admin review instead of defaulting to MCS or BLTDM.

Core concept content should eventually include:

- Simple explanation.
- 3-5 quick questions.
- 1 scenario question.
- 1 free-response application.
- AI feedback.
- Revision/improvement.
- Mastery update.

## D. Proposed Learning Ladder

Learning ladder:

Recognize -> Define -> Connect -> Apply -> Explain -> Improve

DECA roleplay answer structure:

Define -> Explain -> Connect to Scenario -> Above and Beyond / Visual

MVP question type mapping:

- `multiple_choice`: Recognize. Students identify the right concept, term, or exam-style answer.
- `matching`: Define. Students connect vocabulary to accurate definitions.
- `multiple_select`: Connect/Judgment. Students choose multiple relevant actions, tradeoffs, or risks.
- Scenario question: Apply. Students use a concept in a DECA-style situation.
- `free_text`: Explain. Students practice structured roleplay reasoning and written responses.
- Revision: Improve. Students revise based on feedback and move mastery forward.

Advanced question types to document but not build yet:

- `rank_order`.
- `identify_core_concepts_from_roleplay`.

## E. Proposed Database/Domain Model

Do not implement these migrations in Phase 0. These are recommended Phase 1+ models.

### `events`

Purpose: Canonical DECA events and cluster/category metadata.

Major fields:

- `id`, `code`, `name`, `cluster`, `category`, `is_pilot`, `pilot_order`, `created_at`, `updated_at`.

Relationship to existing `resources`:

- `resources.event_code` should eventually link to `events.code` or `events.id`.

RLS/access:

- Students can read active events.
- Admins/advisors can create/update/deactivate events.

### `key_sets`

Purpose: Group concepts into event-specific learning units.

Major fields:

- `id`, `event_id`, `title`, `description`, `sequence`, `status`, `created_at`, `updated_at`.

Relationship to existing `resources`:

- Key sets can reference source PDFs through join tables or extraction records.

RLS/access:

- Students read approved key sets.
- Admins/advisors manage draft, review, and approved key sets.

### `concepts`

Purpose: Reusable learning concepts such as market segmentation, promotion mix, ethics, liability, or contracts.

Major fields:

- `id`, `slug`, `title`, `simple_explanation`, `cluster`, `status`, `source_resource_id`, `created_at`, `updated_at`.

Relationship to existing `resources`:

- `source_resource_id` can point to the resource where the concept was extracted or first curated.

RLS/access:

- Students read approved concepts.
- Admins/advisors manage draft/review/approved concepts.

### `key_set_concepts`

Purpose: Ordered many-to-many relationship between key sets and concepts.

Major fields:

- `id`, `key_set_id`, `concept_id`, `sequence`, `required_mastery_level`.

Relationship to existing `resources`:

- Indirect through `key_sets` and `concepts`.

RLS/access:

- Students read approved mappings.
- Admins/advisors manage mappings.

### `questions`

Purpose: Structured practice items for recognition, definitions, judgment, scenarios, and free-response prompts.

Major fields:

- `id`, `concept_id`, `event_id`, `resource_id`, `question_type`, `prompt`, `scenario_text`, `correct_answer`, `rubric_id`, `difficulty`, `status`, `ai_generated`, `review_status`, `created_at`, `updated_at`.

Relationship to existing `resources`:

- `resource_id` links extracted or source-derived questions back to a PDF resource.

RLS/access:

- Students read approved questions.
- Students should not read hidden official answer details unless needed by the client after completion.
- Admins/advisors manage all statuses.

### `question_choices`

Purpose: Choices for multiple-choice, matching, and multiple-select questions.

Major fields:

- `id`, `question_id`, `label`, `choice_text`, `is_correct`, `match_key`, `sequence`.

Relationship to existing `resources`:

- Indirect through `questions.resource_id`.

RLS/access:

- Students read choices for approved questions, but answer-correctness exposure should be carefully controlled.
- Admins/advisors manage choices.

### `question_attempts`

Purpose: Student attempts on structured learning questions.

Major fields:

- `id`, `user_id`, `question_id`, `selected_choice_ids`, `selected_answer`, `free_text_response`, `is_correct`, `score`, `feedback_id`, `attempt_number`, `created_at`.

Relationship to existing `resources`:

- Indirect through `questions.resource_id`; can also duplicate `resource_id` for analytics if useful.

RLS/access:

- Students manage only their own attempts.
- Admins/advisors can read aggregate data and student-level data where appropriate for advising.

### `concept_mastery`

Purpose: Track student progress at concept level.

Major fields:

- `id`, `user_id`, `concept_id`, `mastery_score`, `ladder_stage`, `last_practiced_at`, `evidence_count`, `needs_review`, `updated_at`.

Relationship to existing `resources`:

- Mastery evidence may come from questions, roleplay scenarios, or exam attempts tied back to source resources.

RLS/access:

- Students read their own mastery.
- Server routes update mastery after validated attempts.
- Admins/advisors can read for coaching dashboards.

### `roleplay_scenarios`

Purpose: Structured roleplay scenarios extracted from PDFs or manually authored.

Major fields:

- `id`, `event_id`, `resource_id`, `title`, `scenario_text`, `participant_role`, `judge_role`, `instructional_area`, `status`, `review_status`, `created_at`, `updated_at`.

Relationship to existing `resources`:

- `resource_id` links to the source roleplay PDF.

RLS/access:

- Students read approved scenarios.
- Admins/advisors manage extracted and authored scenarios.

### `roleplay_performance_indicators`

Purpose: Normalized performance indicators for roleplay scenarios and concepts.

Major fields:

- `id`, `roleplay_scenario_id`, `concept_id`, `indicator_text`, `sequence`, `status`, `review_status`.

Relationship to existing `resources`:

- Replaces or supplements `resources.performance_indicators` for structured learning.

RLS/access:

- Students read approved indicators.
- Admins/advisors approve/edit/reject AI-extracted indicators.

### `rubrics`

Purpose: Rubric definitions for scenarios, free responses, and roleplay grading.

Major fields:

- `id`, `event_id`, `resource_id`, `title`, `description`, `status`, `review_status`, `created_at`, `updated_at`.

Relationship to existing `resources`:

- Source rubric PDFs or judge instructions should link through `resource_id`.

RLS/access:

- Students may read approved rubric summaries.
- Admins/advisors manage full rubric records.

### `rubric_criteria`

Purpose: Individual rubric criteria and scoring levels.

Major fields:

- `id`, `rubric_id`, `criterion_name`, `description`, `max_score`, `sequence`, `scoring_guidance`.

Relationship to existing `resources`:

- Indirect through `rubrics.resource_id`.

RLS/access:

- Students read approved criteria where appropriate.
- Admins/advisors manage criteria.

### `ai_extraction_jobs`

Purpose: Track PDF extraction jobs and review status.

Major fields:

- `id`, `resource_id`, `job_type`, `provider`, `model`, `status`, `review_status`, `confidence_score`, `input_storage_path`, `raw_output_json`, `validated_output_json`, `error_message`, `created_by`, `created_at`, `updated_at`.

Relationship to existing `resources`:

- Every extraction job starts from a `resources` row and its Supabase Storage path.

RLS/access:

- Students should not read extraction jobs.
- Admins/advisors read/manage review status.
- Server routes create/update jobs.

### `resource_classifications`

Purpose: Store AI or rule-based classification results separately from official resource metadata.

Major fields:

- `id`, `resource_id`, `source`, `suggested_resource_type`, `suggested_event_code`, `suggested_cluster`, `suggested_year`, `confidence_score`, `review_status`, `reviewed_by`, `reviewed_at`.

Relationship to existing `resources`:

- Approved classifications may update `resources`, but should not silently overwrite official fields.

RLS/access:

- Admins/advisors review.
- Server routes insert.
- Students do not need access.

### `roleplay_ai_feedback`

Purpose: Store AI grading/feedback for roleplay attempts.

Major fields:

- `id`, `roleplay_attempt_id`, `rubric_id`, `overall_score`, `strengths`, `growth_areas`, `feedback_json`, `model`, `status`, `review_status`, `created_at`.

Relationship to existing `resources`:

- Indirect through `roleplay_attempts.resource_id`.

RLS/access:

- Students read their own approved or completed feedback.
- Admins/advisors can read for review/coaching.
- Server routes create feedback.

### `concept_free_response_feedback`

Purpose: Store feedback for concept-level free-text responses and revisions.

Major fields:

- `id`, `question_attempt_id`, `concept_id`, `user_id`, `overall_score`, `feedback_text`, `strengths`, `growth_areas`, `revision_prompt`, `model`, `status`, `review_status`, `created_at`.

Relationship to existing `resources`:

- Indirect through `questions.resource_id`.

RLS/access:

- Students read their own feedback.
- Server routes create/update.
- Admins/advisors can review as needed.

## F. Gemini AI Architecture

Gemini should be integrated later as a structured server-side AI layer.

Rules:

- Gemini should only be called from server-side code.
- `GEMINI_API_KEY` must never be exposed to frontend code.
- Uploaded PDFs should first be stored in Supabase Storage.
- Server routes or background scripts should read/send PDFs to Gemini.
- Gemini should return structured JSON.
- Structured outputs must be validated before database insert.
- AI results must be stored as `needs_review` or equivalent until an admin/advisor approves them.
- Gemini outputs should never be silently treated as official truth.
- AI-suggested answer keys are not official unless reviewed.

Proposed files:

- `src/lib/ai/gemini/client.ts`
- `src/lib/ai/gemini/prompts.ts`
- `src/lib/ai/gemini/schemas.ts`
- `src/lib/ai/extraction/resource-classifier.ts`
- `src/lib/ai/extraction/exam-extractor.ts`
- `src/lib/ai/extraction/answer-key-extractor.ts`
- `src/lib/ai/extraction/roleplay-extractor.ts`
- `src/lib/ai/extraction/rubric-extractor.ts`
- `src/lib/ai/grading/concept-feedback.ts`
- `src/lib/ai/grading/roleplay-grader.ts`
- `src/app/api/admin/resources/[id]/extract/route.ts`
- `src/app/api/roleplay-attempts/[id]/grade/route.ts`

Suggested validation approach:

- Define runtime schemas for every expected Gemini output.
- Reject malformed output and store the raw output plus error on the extraction job.
- Insert validated records only as draft/needs-review content.
- Keep source pointers to `resource_id`, `storage_path`, job id, provider, model, and prompt version.

## G. Admin Review Workflows

Future admin/advisor review pages should support:

- AI extraction jobs list with filters for pending, failed, needs review, approved, and rejected.
- Extracted resource classifications with confidence and source text.
- Extracted exam questions and choices.
- Extracted answer keys, clearly labeled AI-suggested until reviewed.
- Extracted roleplay scenarios.
- Extracted performance indicators.
- Extracted judge rubrics and rubric criteria.
- AI confidence, validation errors, raw JSON, and parser errors.
- Approve, edit, reject, and bulk actions.
- Side-by-side source PDF/open PDF access for review.
- Audit fields for reviewer, reviewed timestamp, and review notes.

Recommended future routes:

- `/admin/ai-review`
- `/admin/ai-review/jobs/[id]`
- `/admin/ai-review/questions`
- `/admin/ai-review/answer-keys`
- `/admin/ai-review/roleplays`
- `/admin/ai-review/rubrics`

## H. Student Workflows

Future student-facing pages should include:

- `/learn`: event pathway landing page with MCS featured first and BLTDM second.
- `/learn/mcs`: MCS pathway overview, key sets, progress, and recommended next lock.
- `/learn/mcs/key-sets/[id]`: ordered concept set with progress and entry points.
- `/learn/mcs/concepts/[id]`: concept lesson flow.
- Concept lesson flow: simple explanation, quick checks, scenario lock, free response, feedback, revision, mastery update.
- Free-response submission: saves a `question_attempt` and queues/requests concept feedback.
- Revision flow: asks students to improve the answer using feedback and saves revision evidence.
- Roleplay transcript grading: uses saved roleplay attempts and transcripts once transcription/grading exists.
- Mastery dashboard: event-level and concept-level readiness, weak concepts, recommended next practice, and completed locks.

## I. Recommended Implementation Phases

### Phase 0: Audit and rebuild plan

Goal:

- Document current architecture, limitations, target learning model, AI direction, phases, risks, and tests.

Major files likely affected:

- `docs/ojr-deca-roleplay-prep-rebuild-plan.md`
- `AGENTS.md`

Database changes:

- None.

Risks:

- Treating future plans as already implemented.
- Missing baseline schema for `resources` and `profiles`.

Manual checks:

- Confirm existing pages still load.
- Confirm no app behavior changed.

Testing expectations:

- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`

### Phase 1: Learning data model

Goal:

- Add first-class learning tables for events, key sets, concepts, questions, question attempts, concept mastery, and roleplay scenarios.

Major files likely affected:

- `supabase/migrations/*`
- `src/lib/types.ts`
- New service files under `src/lib/services/learn*`
- `scripts/check-database-health.ts`

Database changes:

- Create additive tables, indexes, constraints, review status fields, and RLS policies.
- Seed MCS and BLTDM event records, initial key sets, and approved starter concepts.
- Do not drop or rewrite existing `resources` or `profiles` tables.

Risks:

- RLS blocking admin/advisor review.
- Frontend querying tables before migrations are applied.
- Weak baseline schema causing migration drift.
- The checked-in migrations may not contain complete original create-table SQL for `resources` and `profiles`; create a baseline schema snapshot as a follow-up before deeper rebuild work.

Manual checks:

- Apply migration to local/target Supabase.
- Run `npm run check:db`.
- Confirm old resource, exam, roleplay, dashboard, and admin flows still work.

Testing expectations:

- TypeScript and lint checks.
- Database health checks.
- RLS tests for student, admin, and advisor.

### Phase 2: Gemini infrastructure

Goal:

- Add server-side Gemini client, prompt registry, schemas, validation helpers, AI job tables, and a controlled admin/advisor resource classification path without calling Gemini from the browser.

Major files likely affected:

- `src/lib/ai/gemini/*`
- `src/lib/ai/extraction/*`
- `src/lib/ai/grading/*`
- `src/app/api/admin/ai/classify-resource/route.ts`
- `scripts/test-gemini-resource-classification.ts`
- `supabase/migrations/*_add_ai_infrastructure.sql`
- Environment documentation.

Database changes:

- Add `ai_extraction_jobs` for server-side Gemini job state, raw output, validated output, confidence, and errors.
- Add `resource_classifications` for AI classification suggestions that stay separate from official `resources` metadata until reviewed.
- Enable RLS and keep students from reading AI job/classification output by default.

Risks:

- Accidentally exposing `GEMINI_API_KEY`.
- Inconsistent structured outputs.
- Treating classification suggestions as official resource metadata.
- Running code before the Phase 2 migration is applied.

Manual checks:

- Verify no Gemini key appears in frontend bundles or `NEXT_PUBLIC_*` variables.
- Apply the Phase 2 migration before invoking the classifier.
- Run `npm run test:gemini-classify -- <resource-id>` only with a server-side Gemini key configured.
- Confirm missing Gemini keys and malformed AI output are recorded as failed jobs instead of crashing app pages.

Testing expectations:

- Unit tests for schema validation if test tooling is added.
- Lint, TypeScript, build.
- `npm run check:db` after the Phase 2 migration is applied.

### Phase 3: Gemini PDF extraction

Goal:

- Extract exam questions, answer key suggestions, roleplay scenarios, performance indicators, and rubric suggestions into reviewable records.

Major files likely affected:

- `src/app/api/admin/ai/extract-resource/route.ts`
- `src/lib/ai/extraction/*`
- `src/lib/services/resources.ts`
- Admin review services.
- `scripts/test-gemini-resource-extraction.ts`
- `supabase/migrations/*_add_ai_pdf_extraction_staging.sql`

Database changes:

- Insert extraction jobs and extracted draft records.
- Exam PDFs insert draft questions into `questions` with `status = needs_review`, `ai_extracted = true`, and `admin_reviewed = false`.
- Roleplay PDFs insert draft scenarios into `roleplay_scenarios` with `status = needs_review`, `ai_extracted = true`, and `admin_reviewed = false`.
- Roleplay performance indicators insert individual draft rows into `roleplay_performance_indicators` while keeping `roleplay_scenarios.performance_indicators` synced as compatibility JSONB.
- Answer key PDFs insert suggestions into `ai_extracted_answer_keys`, not official `exam_answer_keys`.
- Rubric PDFs insert draft `rubrics` and `rubric_criteria`.

Risks:

- AI inaccuracy.
- Large PDFs or timeouts.
- Duplicated extraction records.
- Official answer keys confused with AI suggestions.
- Poor PDF text extraction if OCR/text layers are incomplete.

Manual checks:

- Run extraction on one known MCS resource.
- Confirm output remains needs-review.
- Confirm students cannot see unapproved extraction records.
- Confirm `resources.approval_status` is unchanged after extraction.

Testing expectations:

- Validation tests for malformed Gemini output.
- Route auth tests if test tooling exists.
- `npm run test:gemini-extract -- <resource-id> --type=exam` when `GEMINI_API_KEY` and the Phase 3 migration are configured.
- Use `GEMINI_TIMEOUT_MS` to tune server-side Gemini request timeout; it defaults to 90,000 ms.
- Gemini free-tier quota may be low. Full exams may consume multiple requests; roleplay PDFs are better early extraction smoke tests.
- Use `GEMINI_MAX_EXAM_CHUNKS` or `GEMINI_MAX_EXTRACTION_CHARS` locally to limit extraction size while testing. Limited runs are marked `needs_review` with a development-settings warning.
- For large exam and answer-key PDFs, use the chunked extraction diagnostics from `npm run test:gemini-extract -- <resource-id> --type=exam --chunk-size=10000 --chunk-threshold=12000`.
- `npm run check:db` after the Phase 3 migration is applied.

Current Phase 3 implementation notes:

- The pipeline uses extracted text, not Gemini Files API upload. It prefers `resources.detected_text`, then downloads the private `resources` Storage object server-side and parses it with `pdf-parse`.
- Large exam and answer-key PDFs are normalized, split into chunks above 12,000 characters, sent to Gemini chunk by chunk, merged by question number, and stored as `needs_review`. Exam-question extraction trims trailing built-in answer key/explanation sections such as `EXAM—KEY` before chunking.
- Chunk diagnostics are stored on `ai_extraction_jobs.input_metadata` and returned by the local extraction test script: text character count, estimated tokens, strategy, chunk count, and chunk size.
- Gemini quota/rate-limit responses are normalized to `gemini_quota_exceeded`; the UI should show a concise retry-later message instead of raw provider JSON.
- Gemini 503/high-demand capacity errors are retried once per chunk. Missing keys, invalid JSON, schema failures, and non-transient errors are not retried.
- Extracted roleplay performance indicators are normalized into `roleplay_performance_indicators`. Admins/advisors review PIs individually, and approved PI rows are intended to power later student practice and Gemini grading.
- The orchestrator chooses a type from an explicit admin override, latest stored classification, current `resources.resource_type`, or a fresh Gemini classification when needed.
- Duplicate prevention skips existing draft AI content by default. `force=true` creates a new Gemini job but does not delete or overwrite draft extracted records.
- Full review UI, extracted content editors, answer-key approval, student pathway, concept feedback, and roleplay grading remain Phase 4+.

### Phase 4: Admin AI review center

Goal:

- Build admin/advisor workflows to approve, edit, or reject AI-extracted content.

Major files likely affected:

- New `/admin/ai-review` pages and components.
- Review service files.
- Existing admin navigation.
- `src/app/api/admin/ai/review/route.ts`

Database changes:

- Review/audit fields may need additions.

Risks:

- Review UI accidentally publishing incomplete or wrong content.
- Advisors excluded if checks do not use `isAdminRole()`.

Manual checks:

- Review extracted questions, answer keys, scenarios, indicators, and rubrics.
- Confirm approved records become student-visible only after approval.

Testing expectations:

- RLS and role-gated access checks.
- Lint, TypeScript, build.

Current Phase 4 implementation notes:

- `/admin/ai-review` shows extraction job metrics, filters, job cards, errors, confidence, and links to review extracted content.
- `/admin/ai-review/jobs/[id]` shows job metadata, raw JSON, validated JSON, and linked extracted record counts.
- `/admin/ai-review/questions`, `/admin/ai-review/roleplays`, `/admin/ai-review/answer-keys`, and `/admin/ai-review/rubrics` provide review/edit modals for extracted records.
- `/admin/ai-review/roleplays` shows performance indicators as editable review rows with individual status actions. Raw `roleplay_scenarios.performance_indicators` JSONB is retained only as a compatibility/developer fallback.
- Review mutations use `PATCH /api/admin/ai/review` and verify admin/advisor server-side.
- JSONB editing uses textarea JSON with validation before save.
- AI answer keys are labeled practice/not official and remain in `ai_extracted_answer_keys`; conversion to official `exam_answer_keys` is intentionally not implemented yet.
- Student learning pages, concept feedback, roleplay grading, mastery dashboards, and official answer-key conversion remain Phase 5+.

### Phase 4.5: Connect admin upload to extraction

Goal:

- Let admins/advisors trigger Gemini extraction immediately after uploading PDFs, while keeping upload/resource approval behavior unchanged.

Implementation notes:

- `/admin/upload` still uses the existing PDF upload and metadata detection flow.
- Uploaded resources are still created with `approval_status = pending`.
- A post-upload "Run AI Extraction" action calls `POST /api/admin/ai/extract-resource`.
- Each uploaded resource can use auto-detect or an explicit extraction type: exam, answer key, roleplay, or judge rubric.
- An optional unchecked "Run AI extraction after upload" checkbox can run extraction after successful resource creation.
- Extraction errors do not fail the upload and do not publish content.
- Missing `GEMINI_API_KEY` is shown as a clear UI message.
- Duplicate extraction reports existing content and links to AI Review; force re-extraction is explicit and does not overwrite reviewed content.

Not included:

- No student-facing learning pages.
- No official answer-key conversion.
- No Gemini grading.
- No changes to resource approval status.

### Phase 4.6: Canonical DECA event catalog and event matching

Goal:

- Support canonical event matching for the broader resource preparation system while keeping MCS and BLTDM as learning-system pilots only.

Implementation notes:

- The `events` table should contain common DECA events beyond the pilot rows, including AAM, ENT, ETDM, HRM, and other uploaded-resource events.
- `event_aliases` supports matching from filenames, older metadata, common abbreviations, and Gemini output.
- Upload detection and AI extraction should match by exact code, alias, normalized name, filename/path text, resource metadata, and Gemini-detected event code/name.
- If no confident match exists, leave `event_id` null and show the resource as needing event review.
- AI Review dropdowns should list the full canonical catalog and may mark MCS/BLTDM as learning pilots, but must not restrict selection to pilot events.

Not included:

- No `/learn` pages.
- No concept learning pathway.
- No Gemini concept feedback or roleplay grading.

### Phase 4.7: Navigation cleanup and admin workspace consolidation

Goal:

- Keep the sidebar aligned to the student mental model while preserving all admin/advisor functionality.
- Student navigation should prioritize Dashboard, Learn, Roleplays, Exams, Resources, Analytics, Calendar, and Settings.
- Admins and advisors should see one top-level `Admin` item that points to `/admin`.
- `/admin` is the admin workspace and links to resource management, upload, AI review, exam keys, users/roles, and admin analytics.
- Existing admin routes remain intact and protected; they are reached from the workspace instead of cluttering the top-level sidebar.
- When an admin/advisor is on `/admin/resources`, `/admin/upload`, `/admin/ai-review`, `/admin/exam-keys`, `/admin/analytics`, or `/admin/users`, the single Admin sidebar item should remain active.

### Phase 5: Student MCS learning pathway

Goal:

- Launch generic `/learn`, `/learn/[eventCode]`, key set pages, and concept lesson pages with MCS as the first active pilot pathway.
- Keep the learning system multi-event capable. MCS is the first active pilot, BLTDM is the second planned pilot, and future events can be enabled by marking events as learning pilots and adding approved key sets, concepts, and questions.
- Keep canonical resource support and learning pathway support distinct: resource upload/extraction can support all canonical events, while guided learning shows only enabled/pilot learning events.
- Show only approved learning content to students.
- Save question attempts and update concept mastery conservatively without Gemini grading.

Major files likely affected:

- `src/app/learn/*`
- `src/components/learn/*`
- `src/lib/services/learn*`
- `src/components/layout/app-shell.tsx`
- `src/app/api/learn/question-attempts/route.ts`

Database changes:

- Seed or approve initial MCS key sets, concepts, and starter questions.
- No schema change is required for Phase 5 because Phase 1 learning tables already exist.

Phase 5 scope:

- Supports `multiple_choice`, `matching`, `multiple_select`, and `free_text` practice questions.
- MCS starter content covers promotion, target market, brand awareness, positioning, and message strategy.
- `POST /api/learn/question-attempts` validates the authenticated user server-side, rejects unapproved questions, calculates attempt numbers, stores answers, and updates basic mastery.
- Mastery is intentionally conservative: saved attempts move students from learning to practicing, mostly correct keyed checks plus free text can reach almost mastered, and Phase 5 does not claim full AI-scored mastery.
- Gemini concept feedback, revision comparison, readiness dashboards, BLTDM team workflows, and roleplay transcript grading belong to Phase 6 or later.

Risks:

- Building a decorative landing page instead of usable learning flow.
- Dashboard recommendations not matching available content.

Manual checks:

- Student can move through MCS key sets.
- Only approved content appears.
- Existing `/resources`, `/roleplays`, `/exams`, and admin pages still work.

Testing expectations:

- Component and route smoke checks.
- Lint, TypeScript, build.

### Phase 6: Gemini concept feedback and revision

Goal:

- Add AI feedback for concept free responses and a required revision loop.

Major files likely affected:

- `src/lib/ai/grading/concept-feedback.ts`
- Concept lesson pages/components.
- Question attempt and feedback services.

Database changes:

- Use or extend `concept_free_response_feedback`, `question_attempts`, and `concept_mastery`.

Risks:

- Feedback feels authoritative when it should be coaching.
- Feedback saved without validation.
- Mastery updates too aggressively.

Manual checks:

- Submit weak and strong answers.
- Confirm feedback, revision prompt, revision save, and mastery update.

Testing expectations:

- Schema validation.
- Student ownership checks.
- Lint, TypeScript, build.

### Phase 7: Gemini roleplay transcript grading

Goal:

- Grade saved roleplay attempts or transcripts against structured indicators/rubrics.

Major files likely affected:

- `src/lib/ai/grading/roleplay-grader.ts`
- `src/app/api/roleplay-attempts/[id]/grade/route.ts`
- Roleplay attempt detail components.

Database changes:

- Use or extend `roleplay_ai_feedback`.
- Possibly update `roleplay_attempts.ai_feedback_status`, `ai_overall_score`, `ai_feedback_json`, `strengths`, and `growth_areas`.

Risks:

- Student transcripts and recordings are sensitive.
- AI grading may be inconsistent.
- Missing rubric links reduce feedback quality.

Manual checks:

- Grade an owned attempt only.
- Confirm another student cannot access or grade it.
- Confirm failures leave attempt data intact.

Testing expectations:

- Ownership checks.
- Schema validation.
- Lint, TypeScript, build.

### Phase 8: Readiness dashboard and polish

Goal:

- Make the dashboard guide students toward weak concepts, upcoming locks, event readiness, and review tasks.

Major files likely affected:

- `src/components/dashboard/dashboard-view.tsx`
- `src/app/analytics/page.tsx`
- Learn analytics services.

Database changes:

- Aggregation views or indexes may be needed for mastery and attempt performance.

Risks:

- Dashboard becoming noisy.
- Optional data failures breaking core dashboard.

Manual checks:

- Empty-state student.
- Active MCS student with attempts.
- Admin/advisor account.
- Optional analytics unavailable states.

Testing expectations:

- Route smoke tests.
- Build and TypeScript.
- Manual visual checks.

## J. Migration and Deployment Risks

- Supabase migrations are not automatically applied unless run through Supabase CLI or the Supabase SQL Editor.
- Frontend or route code may query tables before they exist in the target Supabase project.
- RLS may block admin/advisor access if policies only check `admin` instead of both `admin` and `advisor`.
- Recursive `profiles` policies can break profile reads.
- AI-generated content may be inaccurate or incomplete.
- Gemini output must be validated before database insert.
- Answer keys must distinguish official reviewed keys from AI-suggested practice keys.
- Student responses, roleplay audio, transcripts, and feedback should be handled carefully.
- `SUPABASE_SERVICE_ROLE_KEY` must never be exposed to frontend code.
- `GEMINI_API_KEY` must never be exposed to frontend code.
- The original `resources` and `profiles` baseline migrations should be captured before adding many new tables.
- Existing resource functionality, OAuth, role checks, exam taking/results, PDF downloads, dashboard, analytics, roleplay practice attempts, and theme behavior must not regress during the rebuild.

## K. Testing Strategy

Recommended checks:

- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`
- `npm run check:db` after migrations are applied.
- `npm run smoke:routes` against a running local server.
- Database health checks for required tables and new OJR DECA Roleplay Preparation App learning tables.
- RLS behavior for student, admin, and advisor accounts.
- Google OAuth callback and `@ojrsd.net` restriction.
- Admin access to `/admin/resources`, `/admin/upload`, `/admin/users`, `/admin/exam-keys`, and future AI review pages.
- Student access to `/dashboard`, `/resources`, `/roleplays`, `/exams`, and future `/learn` pages.
- Resource upload, pending status, approval, rejection, signed PDF open/download.
- Exam answer key creation, exam taking, unanswered responses, result viewing, and attempt deletion.
- Roleplay practice attempt create/edit/delete and audio upload/delete.
- AI extraction job creation once implemented.
- Student question attempt saving once implemented.
- Free-response feedback and revision flow once implemented.
- Dashboard degradation when optional analytics or future learning sections fail.

## Phase 0 Audit Findings To Address Before Phase 1

- Capture a complete baseline SQL migration for existing `profiles` and `resources` if the live schema was created outside the checked-in migration history.
- Decide whether future content status fields use `approval_status`, `review_status`, or both, and keep semantics consistent.
- Decide how official answer keys differ from AI-suggested/generated answer keys in schema and UI.
- Decide whether `resources.event_code` should remain a text field or become a foreign key to `events`.
- Decide whether performance indicators remain on `resources` for backward compatibility while normalized indicators are added.
- Add test tooling if automated route/component/database tests are desired beyond lint, TypeScript, build, health checks, smoke routes, and manual verification.
