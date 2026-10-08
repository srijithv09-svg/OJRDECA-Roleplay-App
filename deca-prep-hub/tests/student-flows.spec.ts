import { test, expect } from "./fixtures";

test("student completes an exam and finds the saved result in history", async ({ page, library }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/dashboard");
  await page.getByRole("link", { name: /Browse exams/ }).click();
  const takingResponse = page.waitForResponse((response) => response.url().endsWith("/api/exams/exam/take"));
  await page.getByRole("link", { name: "Practice exam: Marketing practice exam", exact: true }).click();
  const takingPayload = await (await takingResponse).json();
  expect(takingPayload.questions).toHaveLength(100);
  expect(takingPayload.questions.every((question: object) => !("correct_answer" in question))).toBe(true);

  await page.getByRole("button", { name: "Question 1, answer A", exact: true }).click();
  await page.getByRole("button", { name: "Question 2, answer B", exact: true }).click();
  await page.getByRole("button", { name: "Question 3, answer C", exact: true }).click();
  await page.getByRole("button", { name: "Clear answer for question 3", exact: true }).click();
  await expect(page.getByText("2 of 100 answered", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Review and submit", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Submit this exam for grading?", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("98 unanswered questions will count as incorrect.", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "Question 2, answer B", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Review and submit", exact: true }).click();
  await dialog.getByRole("button", { name: "Submit final attempt", exact: true }).click();
  await expect(page.getByText("1 of 100 correct", { exact: true })).toBeVisible();
  expect(library.attempts).toHaveLength(1);
  expect(library.answers.filter((answer) => answer.selected_answer === "UNANSWERED")).toHaveLength(98);
  await page.getByRole("link", { name: "History & scores", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Attempt history", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Results", exact: true }).click();
  await expect(page.getByText("1 of 100 correct", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("student saves roleplay notes and can read the saved attempt", async ({ page, library }) => {
  await page.goto("/roleplays");
  await page.getByRole("link", { name: "Practice roleplay: Local campaign", exact: true }).click();
  await page.getByRole("button", { name: "Start timer", exact: true }).click();
  await expect(page.getByLabel("Time remaining")).not.toHaveText("10:00");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.getByLabel("Time remaining")).toHaveText("10:00");
  await page.getByLabel("Preparation time", { exact: true }).selectOption("15");
  await expect(page.getByLabel("Time remaining")).toHaveText("15:00");
  await page.getByLabel("Paste or write your roleplay response/transcript").fill("Introduce the audience, campaign objective, and measurement plan.");
  await page.getByLabel("What went well?").fill("Clear opening and concrete budget.");
  await page.getByLabel("What would you improve?").fill("Explain how campaign results will be measured.");
  await page.getByLabel("Judge/partner feedback").fill("Allow more time for questions.");
  await page.getByRole("button", { name: "4", exact: true }).click();
  await page.getByRole("button", { name: "Save practice attempt", exact: true }).click();
  await expect(page.getByRole("link", { name: "Edit attempt", exact: true })).toBeVisible();
  await expect(page.getByText("Introduce the audience, campaign objective, and measurement plan.", { exact: true })).toBeVisible();
  await expect(page.getByText("Allow more time for questions.", { exact: true })).toBeVisible();
  expect(library.roleplays).toHaveLength(1);
  expect(library.roleplays[0].confidence_rating).toBe(4);
  await page.getByRole("link", { name: "History & scores", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Recent roleplay attempts", exact: true })).toBeVisible();
  await page.getByRole("link", { name: /Local campaign/ }).click();
  await expect(page.getByText("Introduce the audience, campaign objective, and measurement plan.", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Edit attempt", exact: true }).click();
  await page.getByLabel("Paste or write your roleplay response/transcript").fill("Revised campaign measurement plan.");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText("Revised campaign measurement plan.", { exact: true })).toBeVisible();
  expect(library.roleplays).toHaveLength(1);
  await page.getByRole("button", { name: "Delete attempt", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  expect(library.roleplays).toHaveLength(1);
  await page.getByRole("button", { name: "Delete attempt", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete attempt", exact: true }).click();
  await expect(page).toHaveURL(/\/roleplays$/);
  expect(library.roleplays).toHaveLength(0);
});

test("student saves a cluster preference and signs out", async ({ page, library }) => {
  await page.goto("/settings");
  await page.getByLabel("Main cluster").selectOption("marketing");
  await page.getByRole("button", { name: "Save cluster", exact: true }).click();
  await expect(page.getByText("Saved. Your library shortcut will use Marketing.", { exact: true })).toBeVisible();
  expect(library.selectedCluster).toBe("marketing");
  await page.reload();
  await expect(page.getByLabel("Main cluster")).toHaveValue("marketing");
  await page.getByRole("button", { name: "Sign out", exact: true }).last().click();
  await expect(page).toHaveURL(/\/login$/);
});

test("reference stays separate from practice and students cannot manage resources", async ({ page, library }) => {
  void library;
  await page.goto("/reference");
  await page.getByRole("searchbox").fill("no matching reference");
  await expect(page.getByRole("heading", { name: "No matching reference documents", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Marketing performance indicators", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Practice (exam|roleplay)/ })).toHaveCount(0);
  await page.getByRole("link", { name: "Marketing performance indicators", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Document details", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Open PDF/ })).toHaveAttribute("href", /fixture\.pdf$/);
  await expect(page.getByRole("link", { name: /^Practice (exam|roleplay)/ })).toHaveCount(0);
  await page.goto("/roleplays");
  await expect(page.getByRole("heading", { name: "Local campaign", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pending document", exact: true })).toHaveCount(0);
  await page.goto("/admin/resources");
  await expect(page.getByRole("heading", { name: "Access Denied", exact: true })).toBeVisible();
});

test("student screens fit mobile and desktop in both themes", async ({ page, library }, testInfo) => {
  void library;
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 960 });
    for (const theme of ["light", "dark"]) {
      await page.goto("/dashboard");
      await expect(page.getByRole("heading", { name: "Practice", exact: true })).toBeVisible();
      const toggle = page.getByRole("button", { name: theme === "light" ? "Switch to light mode" : "Switch to dark mode", exact: true });
      if (await toggle.count()) await toggle.click();
      for (const [path, heading, label] of [["/dashboard", "Practice", "home"], ["/reference", "Reference", "reference"], ["/exams/exam/take", "Answer sheet", "exam"]]) {
        await page.goto(path);
        await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        expect(await page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(theme === "dark");
        await page.screenshot({ path: testInfo.outputPath(`${label}-${width}-${theme}.png`), fullPage: label !== "exam", animations: "disabled" });
      }
    }
  }
});
