import { test, expect } from "./fixtures";

test("admin reviews extracted answers before saving a complete key, then edits and removes rows", async ({ page, library }) => {
  library.role = "advisor";
  library.keys = [];
  await page.goto("/admin/exam-keys");
  await page.getByRole("button", { name: "Manage key", exact: true }).click();
  const editor = page.getByRole("dialog");
  await expect(editor).toBeVisible();
  await editor.getByRole("button", { name: "Extract from PDF", exact: true }).click();
  await expect(editor.getByLabel("Preview or paste answers")).toContainText("100. A");
  expect(library.keys).toHaveLength(0);
  await editor.getByRole("button", { name: "Apply 100 answers", exact: true }).click();
  await expect(editor.getByLabel("Answer for question 100", { exact: true })).toHaveValue("A");
  expect(library.keys).toHaveLength(0);
  await editor.getByLabel("Answer for question 1", { exact: true }).selectOption("B");
  await editor.getByRole("button", { name: "Save key", exact: true }).click();
  await expect(editor.getByText("Saved all 100 answers. This exam is ready for student practice.")).toBeVisible();
  expect(library.keys).toHaveLength(100);
  expect(library.keys.find((row) => row.question_number === 1)?.correct_answer).toBe("B");
  await editor.getByRole("button", { name: "Remove question 100", exact: true }).click();
  await editor.getByRole("button", { name: "Save key", exact: true }).click();
  await expect(editor.getByText("Saved 99 answers. Complete questions 1–100 to enable grading.")).toBeVisible();
  expect(library.keys).toHaveLength(99);
  await page.keyboard.press("Escape");
  await expect(editor).not.toBeVisible();
  await expect(page.getByText("99/100 answers", { exact: false })).toBeVisible();
});

test("manual paste identifies duplicate and missing answers without saving them", async ({ page, library }) => {
  library.role = "admin";
  library.keys = [];
  await page.goto("/admin/exam-keys");
  await page.getByRole("button", { name: "Manage key", exact: true }).click();
  const editor = page.getByRole("dialog");
  await editor.getByLabel("Preview or paste answers").fill("1. A\n1. B\n2. C");
  await expect(editor.getByRole("button", { name: /^Apply .* answers$/ })).toBeDisabled();
  expect(library.keys).toHaveLength(0);
  await editor.getByLabel("Preview or paste answers").fill("1. A\n2. C");
  await editor.getByRole("button", { name: "Apply 2 answers", exact: true }).click();
  await editor.getByRole("button", { name: "Save key", exact: true }).click();
  await expect(editor.getByText("Saved 2 answers. Complete questions 1–100 to enable grading.")).toBeVisible();
  expect(library.keys).toHaveLength(2);
});

test("answer-key editing remains usable on mobile in both themes", async ({ page, library }, testInfo) => {
  library.role = "admin";
  await page.setViewportSize({ width: 390, height: 844 });
  for (const theme of ["light", "dark"]) {
    await page.goto("/admin/exam-keys");
    await expect(page.getByRole("button", { name: "Manage key", exact: true })).toBeVisible();
    const toggle = page.getByRole("button", { name: theme === "light" ? "Switch to light mode" : "Switch to dark mode", exact: true });
    if (await toggle.count()) await toggle.click();
    await page.getByRole("button", { name: "Manage key", exact: true }).click();
    const editor = page.getByRole("dialog");
    await expect(editor.getByLabel("Answer for question 100", { exact: true })).toBeAttached();
    expect(await editor.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`answer-key-mobile-${theme}.png`) });
    await page.keyboard.press("Escape");
    await expect(editor).toBeHidden();
    await expect(page.getByRole("button", { name: "Manage key", exact: true })).toBeFocused();
  }
});
