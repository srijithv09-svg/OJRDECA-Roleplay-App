# OJR DECA Prep Database

The Owen J. Roberts DECA chapter's preparation library for uploaded exams, roleplay scenarios, and reference documents.

- **Practice:** direct access to exams and roleplays, with recent saved attempts.
- **Exams:** uploaded PDFs, answer entry, server-side grading, and score history.
- **Roleplays:** scenario PDFs, preparation timer, notes, reflections, partner feedback, and optional recordings.
- **Reference:** approved performance indicator documents, cluster guides, and other uploaded materials, searchable by topic and filterable by cluster/year.
- **Management:** admins and advisors upload PDFs, review metadata, approve resources, create answer keys, and manage account roles.

Access requires a school Google account ending in `@ojrsd.net`. Students see approved materials and their own attempts. The app contains no AI generation, extraction, or feedback functionality.

## Development

The application directory remains `deca-prep-hub` (also the Vercel root directory).

1. Run `npm install`.
2. Copy `.env.example` to `.env.local` and configure Supabase.
3. Run `npm run dev`.
4. Open [the local app](http://localhost:3000).

Keep the service role key server-side. Google OAuth uses `/auth/callback`; configure the canonical site URL and callback allow list in Supabase. See `AGENTS.md` for project conventions.

## Checks

```sh
npm run lint
npx next typegen
npx tsc --noEmit
npm run build
npm run check:db
npm run smoke:routes
```

The last check needs a running server; set `SMOKE_BASE_URL` for a different port. It checks active routes, removed routes, and unauthenticated API guards. Authenticated upload/approval/practice flows still require a school account.

Historical migrations are retained to preserve existing databases. Removing learning and AI code does not delete saved database records or uploaded files. No new migration is needed for this simplification.
