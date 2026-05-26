<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# AGENTS.md — DECA Prep Hub Codex Project Context

## Project Overview

This project is **DECA Prep Hub**, a web application for the **Owen J. Roberts High School DECA chapter**. The app helps OJR DECA members prepare for DECA roleplays and cluster exams by organizing study resources, letting students practice exams, tracking analytics, and eventually supporting AI-assisted roleplay feedback.

The current user/project owner is building this with:

- **Visual Studio Code** for local development
- **GitHub** for version control
- **Codex / ChatGPT** for feature implementation
- **Vercel** for deployment
- **Supabase** for backend/auth/database/storage

The project is intended for members with `@ojrsd.net` accounts only.

Branding rules:

- Use **OJR DECA** or **Owen J. Roberts DECA** for chapter branding.
- Keep the product/app name as **DECA Prep Hub**.
- Do not use generic or incorrect chapter names such as "Oak Junction Ridge DECA".
- Do not rename database tables, service methods, or routes for branding-only changes.

Theme/UI rules:

- The app supports light and dark mode using the `dark` class on `<html>`.
- Theme preference is persisted in `localStorage` under `theme`.
- First visit should respect `prefers-color-scheme` when no stored preference exists.
- `src/app/layout.tsx` includes an inline theme bootstrap script to reduce hydration flicker.
- `src/components/theme/theme-toggle.tsx` owns the visible light/dark toggle.
- Theme colors are tokenized in `src/app/globals.css`.
- Light mode should use off-white backgrounds, white cards, near-black text, and dark red/burgundy primary accents.
- Dark mode should use near-black backgrounds, charcoal cards, off-white text, and muted crimson/burgundy accents.
- Primary navigation/accent colors should be OJR burgundy, not bright blue. Approval can remain green and reject/error can remain red.
- The top navbar/header should use the OJR DECA burgundy theme: off-white/light grey with subtle burgundy accents in light mode, and charcoal/near-black with subtle burgundy borders in dark mode.
- The dashboard performance hero/card should use explicit OJR DECA burgundy/crimson styling and must not fall back to bright blue.
- Keep the style minimal, professional, spacious, school-appropriate, and free of neon or flashy gradients.

Auth loading behavior:

- During session/profile checks, show a clean full-page auth/loading state such as "Signing you in..." or "Loading your DECA workspace...".
- Do not show the login card after successful OAuth while the app is still checking session/profile and routing to `/dashboard`.
- Do not alter the working Supabase Google OAuth callback flow unless a bug requires it.
- Keep the `@ojrsd.net` restriction intact.

---

## Tech Stack

Use the existing stack. Do not migrate unless explicitly asked.

- **Framework:** Next.js App Router
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **Auth:** Supabase Auth with Google OAuth
- **Database:** Supabase Postgres
- **Storage:** Supabase Storage bucket named `resources`
- **Deployment:** Vercel
- **Local scripts:** TypeScript scripts run with `tsx`

Important packages already used or expected:

- `@supabase/supabase-js`
- `@supabase/ssr`
- `tsx`
- `pdf-parse`

---

## Environment Variables

The app uses these environment variables:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_SITE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

Rules:

NEXT_PUBLIC_SUPABASE_URL is public and safe for frontend use.
NEXT_PUBLIC_SUPABASE_ANON_KEY is public and safe for frontend use, assuming RLS is correct.
NEXT_PUBLIC_SITE_URL is public and should be the canonical app origin.
Local `.env.local` can use `NEXT_PUBLIC_SITE_URL=http://localhost:3000`.
Vercel production should use `NEXT_PUBLIC_SITE_URL=https://ojrdeca-roleplay-app.vercel.app`.
If NEXT_PUBLIC_SITE_URL is unset, browser OAuth uses `window.location.origin` so preview/production domains still work.
NEXT_PUBLIC_SITE_URL is required in Vercel production to keep OAuth redirects on the canonical app domain.
SUPABASE_SERVICE_ROLE_KEY is sensitive and must never be used in frontend/browser code.
Service role key may be used only in:
local scripts
server routes
server-side utilities
admin-only backend logic

Never create a variable named NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY.
Never hardcode localhost for production OAuth redirects.

Deployment Notes

The actual Next.js app lives inside:

OJR-DECA-RP-APP/deca-prep-hub

On Vercel, the Root Directory should be:

deca-prep-hub

Vercel settings should be:

Framework Preset: Next.js
Root Directory: deca-prep-hub
Build Command: npm run build
Install Command: npm install
Output Directory: default / blank

If production returns 404 NOT_FOUND on /, check:

Vercel root directory is deca-prep-hub.
src/app/page.tsx exists.
/ redirects to /dashboard or /login.
Latest GitHub commit was pushed.
Vercel redeployed after root/env changes.

Recommended root page behavior:

import { redirect } from "next/navigation";

export default function HomePage() {
  redirect("/dashboard");
}

Existing auth/middleware should then handle unauthenticated users.

Supabase Auth Requirements

The app uses Google OAuth through Supabase.

Authentication requirements:

Users sign in with Google.
Google OAuth uses the `@supabase/ssr` PKCE callback flow.
Client components use `createBrowserClient` from `@supabase/ssr`.
Server route handlers use `createServerClient` from `@supabase/ssr` with Next cookies.
`signInWithOAuth` redirects to `${origin}/auth/callback`, where `origin` is `NEXT_PUBLIC_SITE_URL` with a browser `window.location.origin` fallback.
`/auth/callback/route.ts` exchanges the OAuth code with `exchangeCodeForSession`, verifies the email domain, prepares the profile, and redirects successful users to `/dashboard`.
Failed auth returns to `/login?error=auth_callback_failed` with a clear message.
Non-OJR accounts return to `/login?error=unauthorized_domain`.
Never exchange OAuth codes in client components.
Never manually parse hash `access_token` fragments.
Never mix localStorage-only auth helpers with the SSR callback exchange; the PKCE verifier must live in cookies for both the browser client and callback route.
Only emails ending in @ojrsd.net should be allowed.
Non-@ojrsd.net users should be signed out and shown a message like:
This app is only for Owen J. Roberts DECA members.
Authenticated users should have a row in profiles.
Admin privileges are controlled through profiles.role.

Supabase Google Auth setup requires:

Google OAuth Client ID
Google OAuth Client Secret
Supabase callback URL registered in Google Cloud Console:
https://<supabase-project-id>.supabase.co/auth/v1/callback

Production auth also needs Supabase URL configuration:

Site URL:
https://ojrdeca-roleplay-app.vercel.app

Redirect URLs:
https://ojrdeca-roleplay-app.vercel.app/auth/callback
http://localhost:3000/auth/callback

Local development keeps `http://localhost:3000/auth/callback` in the redirect allow list.
Production must use the deployed Vercel domain. Do not set Supabase Site URL to localhost for production.
Google Cloud Console should still use the Supabase provider callback URL:
https://<supabase-project-id>.supabase.co/auth/v1/callback

User Roles

There are two roles:

student
admin

profiles table shape:

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  role text check (role in ('student', 'admin')) default 'student',
  created_at timestamp with time zone default now()
);

Admin role is assigned manually in Supabase SQL:

update public.profiles
set role = 'admin'
where email = 'student_email@ojrsd.net';

Important RLS warning:

Avoid recursive profiles policies. Do not create a profile policy that queries profiles from inside a profiles policy to determine admin access. That caused:

infinite recursion detected in policy for relation "profiles"

Safe basic profile policies:

drop policy if exists "Users can read own profile" on public.profiles;
drop policy if exists "Users can insert own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;

create policy "Users can read own profile"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

create policy "Users can insert own profile"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

create policy "Users can update own profile"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

Admin checks should usually load only the current signed-in user’s own profile:

.eq("id", user.id)

Do not broadly query all profiles from the frontend for access control.

Current App Navigation

Student-visible pages:

/dashboard
/roleplays
/exams
/analytics
/calendar
/settings
/resources/[id]
/exams/[id]/take
/exams/attempts/[attemptId]

Auth utility routes:

/auth/callback

Admin-visible pages:

/admin/resources
/admin/analytics
/admin/exam-keys

Admins should see all student links plus admin links. Students should not see admin links.

Database: Resources

Main resource table is resources.

Expected columns include:

id uuid primary key
title text
resource_type text
cluster text
event_name text
instructional_area text
performance_indicators text[]
performance_indicators_reviewed boolean
scenario_number integer or nullable if present
year int
source_url text
file_path text
storage_path text
original_filename text
detected_text text
confidence_score numeric
import_notes text
approval_status text
created_at timestamp

resource_type values:

roleplay
exam
reference
unknown

approval_status values:

pending
approved
rejected

Student-facing pages should only show:

approval_status = "approved"

Admin pages can show pending/approved/rejected.

Supabase Storage

Storage bucket:

resources

This bucket holds uploaded PDFs.

PDF access is handled through signed URLs. The actual signed URL path must be the object path inside the bucket, not including the bucket name.

Correct:

roleplay/2025/DECA_ENT_2025_Association_Event_1.pdf
exam/2025/67c1d6bcee16ad4f3fd05cc6_24-25_Entre-District-Exam.pdf

Incorrect:

resources/roleplay/2025/file.pdf
import_data/raw_pdfs/ENT/file.pdf
C:\Users\...

The app eventually pivoted away from embedded iframe/object PDF preview because it caused too much debugging overhead. Preferred current behavior:

Generate a signed URL server-side or through a safe authenticated route.
Show a clean Open / Download PDF button.
Do not show storage_path, file_path, or developer debug fields to students.

Admin pages may show storage details only in a collapsible Developer details section.

Imported PDF Pipeline

The user imported legally obtained DECA PDFs into:

import_data/raw_pdfs

This folder must be ignored by Git.

.gitignore should include:

import_data/

There is also a test folder used during importer testing:

import_data/raw_pdfs_test

The importer script is:

scripts/import-pdfs.ts

Package script:

"import:pdfs": "tsx scripts/import-pdfs.ts"

The importer:

Recursively scans PDF folders.
Classifies PDFs as roleplay, exam, reference, or unknown.
Extracts PDF text.
Detects title, event, cluster, year, scenario, instructional area, etc.
Uploads PDFs to Supabase Storage bucket resources.
Inserts rows into resources.
Sets approval_status = "pending".
Sets performance_indicators_reviewed = false.
Avoids duplicates using original_filename.

The importer can use:

$env:IMPORT_PDF_DIR="import_data/raw_pdfs"
npm run import:pdfs

For test imports:

$env:IMPORT_PDF_DIR="import_data/raw_pdfs_test"
npm run import:pdfs

Dry-run mode was added:

$env:DRY_RUN="true"
npm run import:pdfs

To clear dry-run in PowerShell:

Remove-Item Env:DRY_RUN
Storage Debug / Repair Scripts

Several scripts were created to debug and repair PDF paths.

Known package scripts may include:

"repair:storage-paths": "tsx scripts/repair-storage-paths.ts",
"storage:find": "tsx scripts/storage-find.ts",
"test:signed-url": "tsx scripts/test-signed-url.ts",
"debug:resource-pdf": "tsx scripts/debug-resource-pdf.ts"

Purpose:

repair:storage-paths: match original_filename to actual bucket paths and update storage_path / file_path.
storage:find -- "search term": search the resources storage bucket for matching object names.
test:signed-url: hardcoded signed URL test for one known path.
debug:resource-pdf -- RESOURCE_ID: inspect a resource row and attempt candidate storage paths.

Known successful signed URL test path:

exam/2025/67c1d6bcee16ad4f3fd05cc6_24-25_Entre-District-Exam.pdf

This proved:

PDFs exist in Supabase Storage.
Signed URLs work.
If PDF link fails, the app/database path is likely wrong.
DECA Instructional Area Mapping

A canonical mapping was added because importer guesses were wrong. The importer originally produced invalid instructional areas such as random PDF text or values that were not aligned with the official roleplay mapping.

Mapping file:

src/lib/deca/instructional-areas.ts

Helper functions should include or preserve:

getEventCodeFromFilenameOrTitle()
getScenarioNumberFromFilenameOrTitle()
getInstructionalAreaForResource(resource)

Repair script:

scripts/repair-instructional-areas.ts

Package script:

"repair:instructional-areas": "tsx scripts/repair-instructional-areas.ts"

Roleplay instructional areas should come from mapping rules, not extracted PDF text.

2025-2026 mapping used:

Principles
PBM = Customer Relations
PEN = Information Management
PFN = Operations
PHT = Economics
PMK = Communication Skills
Personal Financial Literacy
PFL = Managing Credit
Team Decision Making
BLTDM = Customer Relations
BTDM = Selling
ETDM = Product/Service Management
FTDM = Financial Analysis
HTDM = Customer Relations
MTDM = Economics
STDM = Promotion
TTDM = Customer Relations
Individual Series
AAM Scenario 1 = Operations
AAM Scenario 2 = Marketing-Information Management
ACT Scenario 1 = Financial Analysis
ACT Scenario 2 = Financial Analysis
ASM Scenario 1 = Promotion
ASM Scenario 2 = Marketing
BFS Scenario 1 = Financial Analysis
BFS Scenario 2 = Financial Analysis
BSM Scenario 1 = Product/Service Management
BSM Scenario 2 = Promotion
ENT Scenario 1 = Product/Service Management
ENT Scenario 2 = Entrepreneurship
FMS Scenario 1 = Market Planning
FMS Scenario 2 = Customer Relations
HLM Scenario 1 = Promotion
HLM Scenario 2 = Financial Analysis
HRM Scenario 1 = Emotional Intelligence
HRM Scenario 2 = Communication Skills
MCS Scenario 1 = Promotion
MCS Scenario 2 = Product/Service Management
QSRM Scenario 1 = Promotion
QSRM Scenario 2 = Market Planning
RFSM Scenario 1 = Customer Relations
RFSM Scenario 2 = Information Management
RMS Scenario 1 = Promotion
RMS Scenario 2 = Product/Service Management
SEM Scenario 1 = Selling
SEM Scenario 2 = Customer Relations

The repair script updated many rows and skipped resources that lacked reliable event/scenario signals or were outside supported years.

Performance Indicators

The importer originally pulled random PDF fragments as performance indicators, such as:

of this event.
Participant Instructions, 21st Century Skills and Performance Indicators
The participants are to be evaluated...
Exceeds Expectations...

This was cleaned up.

Important rule:

Do not display performance_indicators unless performance_indicators_reviewed = true.
If not reviewed, display:
Performance indicators pending review

Admin edit form should allow manually editing indicators and setting:

performance_indicators_reviewed = true

Cleanup script:

scripts/cleanup-performance-indicators.ts

Package script:

"cleanup:performance-indicators": "tsx scripts/cleanup-performance-indicators.ts"

Cleanup already removed/cleared many bad indicators.

Admin Resource Approval Page

Page:

/admin/resources

Purpose:

Review imported PDFs.
Search/filter resources.
Edit metadata.
Approve/reject resources.
Bulk approve/reject.

Admin resource cards should show only:

title
status badge
resource type badge
year badge
cluster
event
instructional area
original filename
Open / Download PDF button
Edit metadata button
Approve button
Reject button

Admin page should not show these fields in the main UI:

storage_path
file_path
raw import_notes
confidence_score

These can be in a collapsible Developer details section.

Search should work across:

title
original_filename
event_name
cluster
instructional_area
resource_type
year

Filters:

approval_status
resource_type
cluster
instructional_area
year
Student Resource Pages

Pages:

/roleplays
/exams
/resources/[id]

Rules:

Only show approved resources.
Search/filter should be based on actual approved resources, not hardcoded placeholder values.
Do not expose developer fields.

Student roleplay cards should show:

title
event
cluster
instructional area
year
Open / Download PDF button
Practice roleplay button placeholder/future feature

Student exam cards should show:

title
cluster
year
Open / Download PDF button
Take exam button if answer key exists

Do not show to students:

storage_path
file_path
import_notes
confidence_score
developer debug info
unreviewed performance indicators
Exam Answer Key Management

Admin page:

/admin/exam-keys

Purpose:

Admins create answer keys for approved exam PDFs.

Tables:

exam_answer_keys
id uuid
resource_id uuid references resources(id) on delete cascade
question_number integer
correct_answer text
instructional_area text nullable
created_at timestamp
updated_at timestamp

Constraints:

correct_answer must be one of A, B, C, D, E
unique (resource_id, question_number)
exam_attempts
id uuid
user_id uuid references auth.users(id) on delete cascade
resource_id uuid references resources(id) on delete cascade
score integer
total_questions integer
percentage numeric
completed_at timestamp
exam_attempt_answers
id uuid
attempt_id uuid references exam_attempts(id) on delete cascade
question_number integer
selected_answer text
correct_answer text
is_correct boolean
instructional_area text nullable

Migration later allowed selected_answer = "UNANSWERED".

Admin exam keys page supports:

approved exam search/filtering
No Key / Partial / Complete status
Open PDF
bulk paste parser
manual row editing
save/upsert answer keys

Bulk paste accepted formats:

1 B
2 D
3 A
1. B
2. D
3. A
1,B
2,D
3,A

Completion status:

No key = 0 saved questions
Partial key = 1-99 saved questions
Complete key = 100+ saved questions
Student Exam Taking / Grading

Implemented flow:

/resources/[id] exam detail
→ Take Exam
→ /exams/[id]/take
→ submit answers
→ /exams/attempts/[attemptId]

Routes/APIs:

/exams/[id]/take
/exams/attempts/[attemptId]
POST /api/exams/[id]/submit
GET /api/exams/[id]/take
GET /api/exams/attempts/[attemptId]

Security:

Correct answers are not sent to the take page.
Grading happens server-side.
API verifies authenticated @ojrsd.net user.
Results API only returns attempts owned by the logged-in user.
No frontend service-role key usage.

Submission behavior:

Unanswered questions are allowed.
Unanswered questions count as incorrect.
Saved as selected_answer = "UNANSWERED".

Results page shows:

Exam title
Score
Percentage
Correct count
Incorrect count
Completion date
Instructional area breakdown where available
Missed questions list
Back/retake controls

Test with a tiny answer key first:

1 B
2 D
3 A
4 C
5 A

Example student answers:

1 B
2 A
3 A
4 C
5 D

Expected score:

3 / 5 = 60%
Analytics

Implemented real attempt-based analytics.

Shared aggregation file:

src/lib/services/exam-analytics.ts

Student analytics should show:

exams completed
average score
best score
recent score
recent attempts
weak instructional areas based on incorrect answers
strong instructional areas based on correct answers
attempt history
missed-question summary
links to result pages

Admin analytics should show:

total attempts
average score across all attempts
common weak instructional areas
recent attempts across users
most attempted exams
resource counts

Important:

Students only see their own attempts.
Admin analytics verifies current user’s own profile before loading aggregate data.
Avoid profile RLS recursion.

Clean-slate deletion was implemented:

Students can delete their own attempts.
Deleting removes the attempt from analytics.
Related exam_attempt_answers should cascade delete.
Delete buttons exist on result pages and analytics history.

Do not allow students to delete other users’ attempts.

Dashboard

Dashboard now uses Supabase data instead of fake placeholders.

Dashboard should show:

approved roleplay count
approved exam count
approved resource count
recently approved resources
student attempt stats where available
admin-only pending/rejected/resource/user stats where available

Old fake score/streak widgets were removed or marked as coming soon.

Known Issues / Things to Watch
OAuth redirects to localhost in production

If Google sign-in returns to `http://localhost:3000/#access_token=...`, check:

Supabase Auth Site URL is `https://ojrdeca-roleplay-app.vercel.app`.
Supabase Auth Redirect URLs include `https://ojrdeca-roleplay-app.vercel.app/auth/callback`.
Vercel has `NEXT_PUBLIC_SITE_URL=https://ojrdeca-roleplay-app.vercel.app`.
The app code uses `/auth/callback`, not `/dashboard`, as the OAuth `redirectTo`.
Localhost is allowed only for local development redirect URLs.

If Google sign-in returns `PKCE code verifier not found in storage`, check:

The login button uses `createBrowserClient` from `@supabase/ssr`.
The callback is `src/app/auth/callback/route.ts`, not a client page.
The callback uses `createServerClient` from `@supabase/ssr` and `exchangeCodeForSession(code)`.
Both browser and server auth clients share cookie-backed SSR storage.
The app is not mixing localStorage-only Supabase clients with SSR callback exchange.

Vercel 404 on /

Likely causes:

Root Directory wrong; should be deca-prep-hub.
Missing src/app/page.tsx.
Not redeployed after changing root/env vars.
Wrong Git branch connected.
Profiles RLS recursion

If any admin page shows:

infinite recursion detected in policy for relation "profiles"

Fix policies. Avoid recursive admin profile policies.

PDF path issues

If signed URL returns Object not found:

Verify file exists in Supabase Storage bucket resources.
Search exact file with storage:find.
Make sure storage_path / file_path is exact bucket object path.
Do not include resources/ prefix.
Do not include local path fragments like import_data.
Bad instructional areas

Roleplay instructional areas should come from canonical mapping, not PDF text.

Bad performance indicators

Never show unreviewed indicators to students.

Safety / Legal / Content Boundaries

The app uses publicly available or legally obtained DECA PDFs and chapter/internal study materials.

Keep this workflow:

Imported → pending → admin review → approved → visible to students

Do not bypass access controls, scrape login-protected content, or expose materials publicly without review.

The app should function as an internal chapter prep tool, not a public reposting platform.

Recommended Development Workflow

Before major changes:

git status
git add .
git commit -m "Checkpoint message"
git push

After Codex changes, always run:

npm run lint
npx tsc --noEmit
npm run build

For local dev:

npm run dev

If port/server issues occur:

taskkill /PID <pid> /F

If PowerShell blocks scripts, use:

Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
Current Recommended Next Feature

The next feature after deployment/testing should likely be roleplay practice attempts without AI first.

Suggested scope:

Roleplay resource → Practice this roleplay → student writes response/reflection → save attempt → show attempt history → analytics later

Suggested prompt:

Build roleplay practice attempts without AI yet.

Requirements:
1. Add "Practice Roleplay" button on approved roleplay resource detail pages.
2. Create /roleplays/[id]/practice.
3. Student can enter:
   - response notes
   - performance indicator notes
   - self-reflection
   - judge feedback if they practiced with someone
4. Save attempt to Supabase.
5. Create /roleplays/attempts/[attemptId] result/reflection page.
6. Show recent roleplay attempts on dashboard/analytics.
7. Students only see their own attempts.
8. Keep UI consistent.
9. Do not add AI yet.
10. Do not expose SUPABASE_SERVICE_ROLE_KEY in frontend code.

Later AI feedback can be added using Gemini or OpenAI through server-side API routes only.

Future AI Roleplay Feedback Plan

Do not implement AI directly in browser.

Recommended architecture:

Student response/transcript
→ Next.js server API route
→ Gemini/OpenAI API
→ structured JSON feedback
→ save to Supabase
→ show on attempt results page

Possible roleplay attempt table:

roleplay_attempts
- id
- user_id
- resource_id
- response_notes
- performance_indicator_notes
- self_reflection
- judge_feedback
- transcript
- audio_path
- ai_score
- ai_feedback
- strengths
- weaknesses
- created_at

AI feedback should return structured JSON such as:

overall_score
strengths
weaknesses
feedback_by_performance_indicator
recommended_next_steps
improved_response_example

Audio can come later:

Browser MediaRecorder
→ Supabase Storage
→ transcription API
→ AI feedback

Start with text input first.

Codex Behavior Preferences

When working on this project:

Preserve existing UI style.
Avoid large rewrites unless asked.
Keep changes scoped to the requested feature.
Use TypeScript types.
Use existing service-layer patterns.
Keep student/admin permissions separate.
Never expose service role key in frontend.
Use server routes/actions for sensitive operations.
Add loading/error/empty states.
Run lint, TypeScript check, and build after implementation.
Prefer incremental implementation over giant feature bundles.
Do not introduce AI features until basic non-AI workflows are stable.
Quick Health Checklist for a New Device

After cloning the repo:

cd deca-prep-hub
npm install

Create .env.local:

NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_SITE_URL=http://localhost:3000
SUPABASE_SERVICE_ROLE_KEY=...

Run:

npm run lint
npx tsc --noEmit
npm run build
npm run dev

Then test:

/login
/dashboard
/roleplays
/exams
/admin/resources
/admin/exam-keys
/analytics

If using scripts involving PDFs, ensure import_data/ exists locally but remains Git-ignored.

Summary of Completed Milestones

Completed so far:

Next.js app shell
Sidebar dashboard UI
Supabase connection
Google Auth
Production-safe `/auth/callback` OAuth redirect flow
@ojrsd.net restriction
profiles roles: student/admin
resources database
PDF importer
Supabase Storage uploads
admin resource approval page
student resource libraries
PDF open/download signed URL flow
instructional area canonical mapping repair
performance indicator cleanup/review flow
admin exam answer key management
student exam answer entry
server-side grading
exam result pages
real student/admin analytics
student attempt deletion / clean slate

Next likely priorities:

Fix production deployment/root route if needed.
Manually test full deployed auth/resource/exam flow.
Polish UX for exam-taking/results.
Build roleplay practice attempts without AI.
Add AI feedback only after roleplay attempts are stable.
