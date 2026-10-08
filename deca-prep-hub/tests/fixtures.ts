import { test as base, expect, type BrowserContext } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { buildStudentAnalytics } from "../src/lib/server/exam-analytics";
import { normalizeResourceUploadMetadata } from "../src/lib/resources/upload-metadata";
import type { ExamAttempt, ExamAttemptAnswer, ResourceListItem, RoleplayAttempt } from "../src/lib/types";

loadEnvConfig(process.cwd());
const baseURL = "http://localhost:3103";
const host = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname;
const user = { id: "00000000-0000-0000-0000-000000000001", email: "fixture@ojrsd.net", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {} };
const profile = { ...user, role: "student", selected_cluster: null, created_at: "2026-10-01T00:00:00Z", updated_at: null };
const resource = (id: string, title: string, type: ResourceListItem["resource_type"], status = "approved"): ResourceListItem => ({
  id, title, resource_type: type, approval_status: status, cluster: "Marketing", event_code: type === "roleplay" ? "MCS" : null,
  event_name: type === "roleplay" ? "Marketing Communications Series" : null, event_category: null, instructional_area: null,
  year: 2025, original_filename: title + ".pdf", confidence_score: 1, import_notes: "Fixture", file_path: type + "/fixture.pdf", storage_path: type + "/fixture.pdf",
});

export class LibraryFixture {
  role = "student";
  selectedCluster: string | null = null;
  resources = [resource("exam", "Marketing practice exam", "exam"), resource("roleplay", "Local campaign", "roleplay"), resource("reference", "Marketing performance indicators", "reference"), resource("pending", "Pending document", "roleplay", "pending")];
  keys = Array.from({ length: 100 }, (_, index) => ({ id: `key-${index}`, resource_id: "exam", question_number: index + 1, correct_answer: "A", instructional_area: null }));
  attempts: ExamAttempt[] = [];
  answers: ExamAttemptAnswer[] = [];
  roleplays: RoleplayAttempt[] = [];
  uploadRequests = 0;
  failFirstUpload = false;
  unexpected: string[] = [];

  async install(context: BrowserContext) {
    const session = { access_token: `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now()/1000)+3600 })).toString("base64url")}.fixture`, refresh_token: "fixture", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now()/1000)+3600, user };
    await context.addCookies([{ name: `sb-${host.split(".")[0]}-auth-token`, value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"), url: baseURL }]);
    await context.route(`https://${host}/**`, async (route) => {
      const request = route.request(), url = new URL(request.url());
      if (url.pathname === "/auth/v1/user") return route.fulfill({ json: user });
      if (url.pathname === "/auth/v1/logout") return route.fulfill({ status: 204 });
      if (["/rest/v1/profiles", "/rest/v1/rpc/ensure_current_profile"].includes(url.pathname)) return route.fulfill({ json: { ...profile, role: this.role, selected_cluster: this.selectedCluster } });
      const table = url.pathname.split("/").pop();
      const all = table === "resources" ? this.resources : table === "exam_answer_keys" ? this.keys : table === "exam_attempts" ? this.attempts : null;
      if (!all) { this.unexpected.push(request.method() + " " + url.pathname); return route.abort(); }
      let rows = all.filter((row) => Object.entries(row).every(([key, value]) => {
        const filter = url.searchParams.get(key);
        return !filter || filter === `eq.${value}` || (filter.startsWith("in.(") && filter.slice(4,-1).split(",").includes(String(value)));
      }));
      if (request.method() === "PATCH") rows.forEach((row) => Object.assign(row, request.postDataJSON()));
      if (table === "exam_answer_keys" && request.method() === "DELETE") {
        this.keys = this.keys.filter((key) => !rows.includes(key));
        return route.fulfill({ status: 204 });
      }
      if (table === "exam_answer_keys" && request.method() === "POST") {
        const incoming = request.postDataJSON();
        for (const entry of Array.isArray(incoming) ? incoming : [incoming]) {
          const existing = this.keys.find((key) => key.resource_id === entry.resource_id && key.question_number === entry.question_number);
          if (existing) Object.assign(existing, entry); else this.keys.push({ id: crypto.randomUUID(), ...entry });
        }
        rows = this.keys.filter((key) => key.resource_id === (Array.isArray(incoming) ? incoming[0] : incoming).resource_id);
      }
      const count = rows.length;
      const limit = Number(url.searchParams.get("limit") ?? rows.length), offset = Number(url.searchParams.get("offset") ?? 0);
      rows = rows.slice(offset, offset + limit);
      const headers = { "content-range": `0-${Math.max(0, rows.length-1)}/${count}` };
      if (request.method() === "HEAD") return route.fulfill({ status: 200, headers, body: "" });
      return route.fulfill({ headers, json: request.headers().accept?.includes("object") ? rows[0] ?? null : rows });
    });
    await context.route(baseURL + "/fixture.pdf", (route) => route.fulfill({ contentType: "application/pdf", body: "%PDF-1.4\n%%EOF" }));
    await context.route(baseURL + "/api/**", async (route) => {
      const req = route.request(), path = new URL(req.url()).pathname;
      if (path === "/api/settings/cluster-preference") {
        this.selectedCluster = req.postDataJSON().selected_cluster;
        return route.fulfill({ json: { profile: { ...profile, role: this.role, selected_cluster: this.selectedCluster } } });
      }
      if (path.endsWith("/pdf")) return route.fulfill({ json: { signedUrl: baseURL + "/fixture.pdf" } });
      if (path === "/api/admin/resources/upload") {
        this.uploadRequests++;
        if (this.failFirstUpload && this.uploadRequests === 1) return route.fulfill({ status: 413, body: "Request Entity Too Large" });
        const form = await new Response(new Uint8Array(req.postDataBuffer()!), { headers: req.headers() }).formData();
        expect(form.getAll("files")).toHaveLength(1);
        const submittedMetadata = JSON.parse(String(form.get("metadata")))[0];
        const file = form.get("files") as File;
        const metadata = normalizeResourceUploadMetadata(file.name, submittedMetadata);
        const item = { ...resource(crypto.randomUUID(), metadata.title, metadata.resource_type, "pending"), ...metadata };
        this.resources.push(item);
        return route.fulfill({ json: { uploadedCount: 1, failedCount: 0, results: [{ originalFilename: metadata.original_filename, resource: item }] } });
      }
      if (path.endsWith("/extract")) return route.fulfill({ json: { rows: Array.from({ length: 100 }, (_, index) => ({ question_number: index + 1, correct_answer: "A", instructional_area: null })), source: "printed-key" } });
      if (path === "/api/analytics/student") return route.fulfill({ json: buildStudentAnalytics({ attempts: this.attempts, answers: this.answers, roleplayAttempts: this.roleplays, resources: this.resources, examAnalyticsUnavailable: false, roleplayPracticeUnavailable: false }) });
      if (path === "/api/exams/exam/take") return route.fulfill({ json: { resource: this.resources[0], hasAnswerKey: true, questionCount: 100, questions: this.keys.map(({ question_number, instructional_area }) => ({ question_number, instructional_area })) } });
      if (path === "/api/exams/exam/submit") {
        const submitted = req.postDataJSON().answers as Array<{ question_number: number; selected_answer: string }>;
        const id = crypto.randomUUID(), score = submitted.filter((answer) => answer.selected_answer === "A").length;
        this.attempts.push({ id, user_id: user.id, resource_id: "exam", score, total_questions: 100, percentage: score, completed_at: new Date().toISOString() });
        this.answers = this.keys.map((key) => ({ id: crypto.randomUUID(), attempt_id: id, question_number: key.question_number, selected_answer: (submitted.find((answer) => answer.question_number === key.question_number)?.selected_answer ?? "UNANSWERED") as ExamAttemptAnswer["selected_answer"], correct_answer: "A", is_correct: submitted.some((answer) => answer.question_number === key.question_number && answer.selected_answer === "A"), instructional_area: null }));
        return route.fulfill({ json: { attemptId: id } });
      }
      if (path.startsWith("/api/exams/attempts/")) return route.fulfill({ json: { attempt: this.attempts[0], resource: this.resources[0], answers: this.answers, breakdown: [] } });
      if (path === "/api/roleplays/roleplay/attempts") {
        if (req.method() === "POST") {
          const attempt = { id: crypto.randomUUID(), user_id: user.id, resource_id: "roleplay", audio_path: null, transcript: null, transcript_status: "none", created_at: new Date().toISOString(), updated_at: null, ...req.postDataJSON() } as RoleplayAttempt;
          this.roleplays.push(attempt); return route.fulfill({ json: { attemptId: attempt.id } });
        }
        return route.fulfill({ json: this.roleplays });
      }
      if (path.startsWith("/api/roleplays/attempts/")) {
        const attempt = this.roleplays.find((row) => row.id === path.split("/").pop());
        if (req.method() === "PUT" && attempt) Object.assign(attempt, req.postDataJSON());
        if (req.method() === "DELETE") {
          this.roleplays = this.roleplays.filter((row) => row !== attempt);
          return route.fulfill({ json: { deleted: true } });
        }
        return route.fulfill({ json: { attempt, resource: this.resources[1] } });
      }
      this.unexpected.push(req.method() + " " + path); return route.abort();
    });
  }
}

export const test = base.extend<{ library: LibraryFixture }>({
  library: async ({ context }, provideFixture) => {
    const library = new LibraryFixture(); await library.install(context); await provideFixture(library); expect(library.unexpected).toEqual([]);
  },
});
export { expect };
