import assert from "node:assert/strict";
import { test } from "node:test";
import { extractExamAnswerKey } from "../src/lib/exams/answer-key-extraction";
import { getExamKeyStatus } from "../src/lib/exams/answer-key-status";
import { verifyPrintedAnswerKeys } from "../src/lib/exams/answer-key-verification";

const numbers = Array.from({ length: 100 }, (_, index) => index + 1);
const printedRows = numbers.map((number) => `${number}. ${["B", "D", "A", "C"][number % 4]}\nExplanation text.`);
const key = `MARKETING CLUSTER EXAM—KEY 1\n${printedRows.join("\n")}`;

test("reads only the explicitly labeled printed key, preserving every answer", () => {
  const rows = extractExamAnswerKey(`1. A question in the exam\n2. B another question\n${key}`);
  assert.deepEqual(rows.map((row) => row.question_number), numbers);
  assert.deepEqual(rows.map((row) => row.correct_answer), numbers.map((number) => ["B", "D", "A", "C"][number % 4]));
  assert.ok(rows.every((row) => row.instructional_area === null));
});

test("supports repeated page headers, CRLF, tabs and nonbreaking spaces", () => {
  const rows = printedRows.map((line, index) => `${index % 5 === 0 ? "Test 1141 EXAM-KEY 2\n" : ""}${line.replace(". ", ".\t")}`);
  assert.equal(extractExamAnswerKey(rows.join("\r\n").replace(" ", "\u00a0")).length, 100);
});

test("refuses missing, duplicate, conflicting, invalid and out-of-range answers", () => {
  assert.throws(() => extractExamAnswerKey(key.replace(printedRows[49], "")), /Missing: 50/);
  assert.throws(() => extractExamAnswerKey(`${key}\n1. D`), /appears more than once/);
  assert.throws(() => extractExamAnswerKey(key.replace("1. D", "1. Z")), /unexpected answer/);
  assert.throws(() => extractExamAnswerKey(`${key}\n101. A`), /unexpected answer/);
});

test("does not infer a key from roleplays, blueprints, question pages or an unreadable PDF", () => {
  for (const text of ["", "EXAM BLUEPRINT\n1. B", printedRows.join("\n"), "JUDGE INSTRUCTIONS\n1. C"]) {
    assert.throws(() => extractExamAnswerKey(text), /No readable/);
  }
});

test("grading readiness requires exactly questions 1–100, never just a row count", () => {
  assert.equal(getExamKeyStatus([]), "no-key");
  assert.equal(getExamKeyStatus(numbers), "complete");
  assert.equal(getExamKeyStatus([...numbers].reverse()), "complete");
  for (const rows of [numbers.slice(0, 99), [...numbers, 101], [...numbers.slice(1), 101], [...numbers.slice(0, 99), 99]]) {
    assert.equal(getExamKeyStatus(rows), "partial");
  }
});

test("reads explicitly headed compact tables and split number/letter lines", () => {
  const table = numbers.reduce((lines, number, index) => {
    const line = Math.floor(index / 4);
    lines[line] = `${lines[line] ?? ""}${number} A\t`;
    return lines;
  }, [] as string[]);
  assert.equal(extractExamAnswerKey(`ANSWER KEY\n${table.join("\n")}`).length, 100);
  assert.equal(extractExamAnswerKey(`EXAM KEY\n${numbers.map((n) => `${n}.\nB`).join("\n")}`).length, 100);
  assert.equal(extractExamAnswerKey(key.replaceAll(". ", ".")).length, 100);
});

test("cross-check blocks conflicting readers, identifies single-reader previews, and rejects missing keys", () => {
  assert.equal(verifyPrintedAnswerKeys([key, key]).verification, "matched");
  assert.equal(verifyPrintedAnswerKeys([null, key]).verification, "single-reader");
  assert.match(verifyPrintedAnswerKeys([key, ""]).notice, /could not verify/);
  assert.throws(() => verifyPrintedAnswerKeys([key, key.replace("1. D", "1. A")]), /disagree on questions 1/);
  assert.throws(() => verifyPrintedAnswerKeys([null, null]), /could not be read/);
  assert.throws(() => verifyPrintedAnswerKeys(["", "EXAM BLUEPRINT"]), /No readable/);
});

test("loads all answer-key statuses beyond the 1000-row response cap and 100-resource batch", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://answer-key-tests.invalid";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  const exams = Array.from({ length: 105 }, (_, index) => ({ id: `exam-${String(index).padStart(4, "0")}`, title: `Exam ${index}`, resource_type: "exam", approval_status: "approved" }));
  const keys = exams.flatMap((exam) => numbers.map((question_number) => ({ resource_id: exam.id, question_number })));
  const originalFetch = globalThis.fetch;
  let keyPages = 0;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, "answer-key-tests.invalid", "tests must never contact a real backend");
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const limit = Math.min(1000, Number(url.searchParams.get("limit") ?? 1000));
    if (url.pathname.endsWith("/resources")) return Response.json(exams.slice(offset, offset + limit));
    assert.ok(url.pathname.endsWith("/exam_answer_keys"));
    const ids = url.searchParams.get("resource_id")!.slice(4, -1).split(",");
    const filtered = keys.filter((row) => ids.includes(row.resource_id));
    keyPages++;
    return Response.json(filtered.slice(offset, offset + limit));
  };
  try {
    const { ExamKeysService } = await import("../src/lib/services/exam-keys");
    const result = await ExamKeysService.getApprovedExamResourcesWithKeyStatus();
    assert.equal(result.length, 105);
    assert.ok(result.every((exam) => exam.answer_key_count === 100 && exam.answer_key_status === "complete"));
    assert.ok(keyPages > 10);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("exam listing does not stop at the backend's first 1000 resources", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://answer-key-tests.invalid";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  const exams = Array.from({ length: 1005 }, (_, index) => ({ id: `exam-${String(index).padStart(4, "0")}`, title: `Exam ${index}` }));
  const originalFetch = globalThis.fetch;
  const offsets: number[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, "answer-key-tests.invalid");
    if (url.pathname.endsWith("/exam_answer_keys")) return Response.json([]);
    assert.ok(url.pathname.endsWith("/resources"));
    const offset = Number(url.searchParams.get("offset") ?? 0);
    offsets.push(offset);
    return Response.json(exams.slice(offset, offset + 1000));
  };
  try {
    const { ExamKeysService } = await import("../src/lib/services/exam-keys");
    const result = await ExamKeysService.getApprovedExamResourcesWithKeyStatus();
    assert.equal(result.length, 1005);
    assert.deepEqual(offsets, [0, 1000]);
    assert.ok(result.every((exam) => exam.answer_key_status === "no-key"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
