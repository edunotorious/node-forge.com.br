import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { AUTH_USER_FILE, makeTestUser } from "./helpers";

test.describe("auth roundtrip", () => {
  // These tests are about signing in, so they start logged out instead of
  // reusing the shared session from auth.setup.ts.
  test.use({ storageState: { cookies: [], origins: [] } });

  test("unauthenticated /projects redirects to /login with next param", async ({
    page,
  }) => {
    await page.goto("/projects");
    await expect(page).toHaveURL(/\/login/);
    // The `next=` search param is what bounces the user back after a
    // successful sign-in — the proxy attaches it on the redirect.
    expect(page.url()).toContain("next=%2Fprojects");
  });

  test("register → login → projects → logout", async ({ page }) => {
    const user = makeTestUser();

    await page.goto("/register");
    await expect(
      page.getByRole("button", { name: "Criar conta" }),
    ).toBeVisible();

    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Senha").fill(user.password);
    await page.getByRole("button", { name: "Criar conta" }).click();

    // POST /api/auth/register → router.push("/login?registered=1").
    await page.waitForURL(/\/login/);

    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Senha").fill(user.password);
    await page.getByRole("button", { name: "LOGIN" }).click();

    await page.waitForURL(/\/projects/, { timeout: 15_000 });
    await expect(
      page.getByRole("heading", { name: "Projetos" }),
    ).toBeVisible();

    // TopBar logout — common.logout = "Sair".
    await page.getByRole("button", { name: "Sair" }).click();
    await page.waitForURL(/\/login/);
  });

  test("login from an English page returns to that page", async ({ page }) => {
    // Logs the shared user in again (login allows 5/min) instead of
    // registering another one against the 3/min register limit.
    const user = JSON.parse(readFileSync(AUTH_USER_FILE, "utf8"));

    await page.goto("/en/projects");
    await expect(page).toHaveURL(/\/en\/login\?next=%2Fprojects$/);

    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password").fill(user.password);
    await page.getByRole("button", { name: "LOGIN" }).click();

    await page.waitForURL(/\/en\/projects$/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  });

  // NOTE: no "wrong password" test here — it would need another register
  // against the 3/minute per-IP limit. That branch is covered by the
  // backend pytest suite where rate limits aren't in play.
});
