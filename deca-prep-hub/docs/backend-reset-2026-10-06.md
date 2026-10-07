# Content reset and backend verification — 2026-10-06

The user explicitly requested removal of all uploaded content and obsolete backend data so the library can start with new uploads. This reset was applied to project `tyithayzyvssodazqxzq`.

## Applied changes

- Removed 200 resource records and their 100 answer-key rows.
- Removed all 377 PDF objects, including objects without a current resource record.
- Removed 18 obsolete Learn/AI tables and 336 rows in those tables, without `CASCADE`.
- Removed five unused AI-feedback columns from `roleplay_attempts`.
- Preserved all six existing profiles, their roles, and their authentication accounts.
- Retained six active application tables and private `resources` and `roleplay-audio` buckets. The missing audio bucket was created.
- Retained inert resource PI columns temporarily for compatibility with the currently deployed client; current source no longer reads or writes them.

The content deletion was a one-time operation, not a repeatable migration. Schema and policy changes are recorded in `supabase/migrations/20261006234623_retire_unused_learning_tables_and_fix_permissions.sql`.

## Recovery copy

Local recovery directory: `C:/Users/vinay/.codex/backups/ojr-deca-reset-20261006` (outside the repository).

Contains JSON data exports for all 24 original public tables, schema/function/policy metadata, a storage manifest, and all 377 original file objects (135,839,884 bytes). File sizes and SHA-256 checksums were verified before deletion. This is a content recovery export, not a full PostgreSQL or Auth backup. Existing authentication accounts were not deleted.

## Backend fixes

- Removed overlapping profile policies and blocked direct role self-promotion with column-level grants.
- Included advisors in resource approval and answer-key management permissions.
- Restricted resource reads to school-authenticated users; students see only approved resources.
- Made score and attempt writes server-only; clients cannot submit fabricated stored scores directly to the database.
- Preserved own-attempt access and prevented access to other users' attempts.
- Removed unnecessary `SECURITY DEFINER` privileges from existing functions.

## Verification

- `scripts/verify-backend-policies.sql`: student, advisor, and admin profile bootstrap; approval; answer-key CRUD; private attempt ownership; denial of role escalation, fabricated scores, anonymous access, and non-school access. All test changes rolled back.
- Live local-app-to-Supabase checks: advisor uploads for roleplay/exam/reference, pending visibility, approval, student answer-key secrecy, grading with an unanswered question, roleplay save, audio upload and signed playback, cross-user denial, signed reference PDF, and profile role protection.
- Temporary verification accounts, resource rows, answer keys, attempts, and storage objects were deleted after testing.
- Database health checks pass for all six active tables. Post-reset queries confirm zero content rows and zero stored files.
- Supabase security advisor no longer reports database function privilege findings. Its remaining platform notice is disabled leaked-password protection; this is separate from the content reset. [Supabase password protection guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

The broader answer-key and interface work continues separately; these checks do not claim that work is complete.
