import { test, expect } from "./fixtures";

test("Google sign-in does not request a school domain", async ({ page }) => {
  await page.route("**/auth/v1/authorize?**", (route) => route.fulfill({
    contentType: "text/html",
    body: "Google sign-in request captured",
  }));
  await page.goto("/login");
  await expect(page.getByText("Any Google account can sign in. An OJR school email is not required.")).toBeVisible();
  const requestPromise = page.waitForRequest((request) => new URL(request.url()).pathname === "/auth/v1/authorize");
  await page.getByRole("button", { name: /Sign in with Google$/ }).click();
  const url = new URL((await requestPromise).url());
  expect(url.searchParams.get("provider")).toBe("google");
  expect(url.searchParams.has("hd")).toBe(false);
  expect(new URL(url.searchParams.get("redirect_to")!).pathname).toBe("/auth/callback");
  expect(url.searchParams.get("code_challenge")).toBeTruthy();
});

test("a personal Google account reaches practice after session validation", async ({ page, library }) => {
  void library;
  await page.goto("/login");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Practice", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Practice", exact: true })).toBeVisible();
});

test("signed-out visitors still need to sign in", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("button", { name: /Sign in with Google$/ })).toBeVisible();
});
