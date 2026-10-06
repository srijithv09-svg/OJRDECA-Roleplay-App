<!-- BEGIN:nextjs-agent-rules -->
# Next.js version-specific guidance
Read relevant guides in `node_modules/next/dist/docs/` before changing framework behavior. This app uses Next.js 16 App Router.
<!-- END:nextjs-agent-rules -->

# OJR DECA Prep Database

Internal preparation library for Owen J. Roberts High School DECA. The current product direction is practice using existing uploaded resources, with manual creation and approval by admins/advisors.

## Product scope

- Product name: **OJR DECA Prep Database**. Chapter name: **OJR DECA** or **Owen J. Roberts DECA**.
- Student navigation: Practice (`/dashboard`), Roleplays, Exams, Reference (`/reference`), History & scores (`/analytics`), Settings.
- `/resources` redirects to `/reference`; `/resources/[id]` remains the shared document detail route.
- No Learn module, AI generation/extraction/feedback, recommended next steps, readiness system, or calendar.
- Practice uses approved uploaded PDFs. Reference includes uploaded PI documents, cluster guides, and exam blueprints.
- Roleplay practice supports a preparation timer, written notes, self-reflection, partner feedback, confidence, and optional audio recordings.
- Exam answers are graded server-side using manually managed answer keys; unanswered questions count as incorrect.
- Preserve users' existing resources, profiles, saved attempts, and recordings. Historical SQL migrations stay intact; don't drop legacy tables or rewrite migration history as part of UI cleanup.
- `docs/ojr-deca-roleplay-prep-rebuild-plan.md` is historical, superseded by this direction.

## Stack and local setup

Next.js App Router, React, TypeScript, Tailwind CSS, Supabase Auth/Postgres/Storage. The app and Vercel root directory remain `deca-prep-hub`; changing the product name does not require moving the checkout.

Environment: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`, and server-only `SUPABASE_SERVICE_ROLE_KEY`. See `.env.example`. No AI credentials are required.

## Authentication and permissions

- Preserve Google OAuth with `@supabase/ssr` PKCE cookie storage and server `/auth/callback` code exchange.
- Only `@ojrsd.net` accounts may use the app. Never expose the service role key in browser code or a `NEXT_PUBLIC_*` variable.
- Use `isAdminRole(role)` for management gates; both `admin` and `advisor` have the same current management privileges. Students cannot upload, approve, edit answer keys, or manage roles.
- Sensitive operations verify the requesting user on the server before using privileged clients. Never trust user-editable metadata for authorization.
- Use the current user's own profile for access checks. Avoid recursive profiles RLS policies; admin-wide user operations use server routes.
- Preserve the fallback for environments missing `profiles.updated_at`.
- User role management prevents demoting the final admin/advisor.
- During session checks show a loading screen; don't flash the login card after successful OAuth.
- Student attempt APIs check ownership before read/update/delete or audio access.

## Resource lifecycle

- Upload/import → pending → manual review → approved → student visibility.
- Admin/advisor tools: `/admin`, `/admin/upload`, `/admin/resources`, `/admin/exam-keys`, `/admin/users`, `/admin/analytics`.
- Resource types: `roleplay`, `exam`, `reference`, `unknown`. Students see only approved resources.
- Uploads support manual metadata correction and deterministic filename detection, with canonical event definitions in `src/lib/deca/events.ts`.
- Unknown event matches remain unknown; never default them to MCS or BLTDM.
- PDFs live in the private `resources` bucket. Signed URLs use object paths without a bucket prefix. Open/download PDFs; don't expose storage paths or import debugging fields to students.
- Audio lives in the private `roleplay-audio` bucket. Server routes verify attempt ownership for upload, signed playback links, and deletion.
- Do not read, extract, edit, or display performance indicator arrays on individual resources. PI documents remain uploaded reference PDFs. Legacy database columns and migrations are retained for compatibility.
- Preserve approval/edit/bulk actions and manual answer-key entry/paste. Keep students' correct answers off exam-taking payloads.
- Imported PDFs under `import_data/` stay Git-ignored.

## UI

Keep a restrained, practical daily-use interface: clear typography, compact resource rows, quiet borders, burgundy accents, and useful empty/error/loading states. Avoid decorative gradients, excessive badges, placeholder roadmap features, and implementation details in student flows.

Light/dark themes use tokens in `src/app/globals.css`, the `dark` class on `<html>`, `localStorage.theme`, and a first-visit system preference. Preserve the bootstrap script and visible theme toggle. Keep mobile layouts and keyboard focus usable.

## Verification

Run `npm run lint`, `npx tsc --noEmit`, and `npm run build` after changes. `npx next typegen` regenerates route declarations after removing routes. Against a running server, run `npm run smoke:routes`. `npm run check:db` verifies the active tables without writing data. Smoke tests don't prove authenticated flows; report the limits of browser or API checks honestly.
