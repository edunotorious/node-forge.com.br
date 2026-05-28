import { expect, test } from "@playwright/test";

import { makeTestUser } from "./helpers";

test.describe("auth roundtrip", () => {
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

  // NOTE: a third "wrong password" test was intentionally NOT added here.
  // /auth/register is rate-limited at 3/minute per IP — running it on top
  // of the two registers below (auth happy path + Hello World) would
  // start tripping 429s. The wrong-password branch is covered by the
  // backend pytest suite where rate limits aren't in play.
});
