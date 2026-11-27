import { expect, test } from "@playwright/test";

// Public community feedback wall at /feedback: everyone reads, signed-in
// users post (optionally anonymously) and can delete their own.

test.describe("feedback wall", () => {
  test("posting from the top bar publishes it for everyone", async ({ page, browser }) => {
    const note = `E2E público ${Date.now().toString(36)}`;

    await page.goto("/projects");
    await page.getByRole("link", { name: "Feedbacks da comunidade" }).click();
    await expect(page).toHaveURL(/\/feedback\?from=%2Fprojects$/);
    await expect(page.getByRole("heading", { name: "Feedbacks da comunidade" })).toBeVisible();

    const send = page.getByRole("button", { name: "Publicar feedback" });
    await expect(send).toBeDisabled();
    await page.getByRole("button", { name: "4 de 5" }).click();
    await page.getByLabel("Comentário").fill(note);
    const posted = page.waitForResponse(
      (r) => r.url().endsWith("/api/feedback") && r.request().method() === "POST",
    );
    await send.click();
    const res = await posted;
    expect(res.status()).toBe(201);
    expect(await res.json()).toMatchObject({ rating: 4, mine: true, anonymous: false });
    await expect(page.getByText("Obrigado! Seu feedback foi publicado.")).toBeVisible();

    const mine = page.getByRole("listitem").filter({ hasText: note });
    await expect(mine).toBeVisible();
    await expect(mine.getByText("seu", { exact: true })).toBeVisible();

    // A visitor (no session) sees it too, without email or delete button.
    const visitor = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const v = await visitor.newPage();
    await v.goto("/feedback");
    const seen = v.getByRole("listitem").filter({ hasText: note });
    await expect(seen).toBeVisible();
    await expect(seen.getByText("@example.com")).toHaveCount(0);
    await expect(seen.getByRole("button", { name: "Excluir" })).toHaveCount(0);
    await expect(v.getByText("Entre na sua conta para deixar um feedback.")).toBeVisible();
    await visitor.close();
  });

  test("anonymous feedback hides the name; authors can delete theirs", async ({ page }) => {
    const note = `E2E anônimo ${Date.now().toString(36)}`;
    await page.goto("/feedback");
    await page.getByLabel("Comentário").fill(note);
    await page.getByLabel("Publicar como anônimo").check();
    await page.getByRole("button", { name: "Publicar feedback" }).click();

    const card = page.getByRole("listitem").filter({ hasText: note });
    await expect(card.getByText("Anônimo", { exact: true })).toBeVisible();

    // Still there after a reload (it was saved, not only drawn).
    await page.reload();
    await expect(card).toBeVisible();

    page.once("dialog", (d) => d.accept());
    await card.getByRole("button", { name: "Excluir" }).click();
    await expect(page.getByText("Feedback excluído.")).toBeVisible();
    await expect(card).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("listitem").filter({ hasText: note })).toHaveCount(0);
  });
});
