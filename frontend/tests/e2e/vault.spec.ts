import { expect, test } from "@playwright/test";

import { bellStateGraph } from "./helpers";

// Node Vault marketplace: publishing with a price from the editor, the
// buyer-side preview of a paid listing, and the price filter. Runs as the
// shared user from auth.setup.ts; visitor checks use a fresh context.

async function createProject(
  request: import("@playwright/test").APIRequestContext,
  name: string,
) {
  const res = await request.post("/api/projects", { data: { name } });
  expect(res.status()).toBe(201);
  const project = await res.json();
  await request.patch(
    `/api/projects/${project.id}/files/${project.files[0].id}`,
    { data: { graph_json: bellStateGraph() } },
  );
  return project as { id: string };
}

test.describe("vault marketplace", () => {
  test("paid listing: author keeps the full view, visitors only a preview", async ({
    page,
    browser,
  }) => {
    const title = `Premium ${Date.now().toString(36)}`;
    const project = await createProject(page.request, title);

    await page.goto(`/projects/${project.id}`);
    await page.getByRole("button", { name: "Publicar no Vault" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("radio", { name: "Pago" }).click();
    const price = dialog.getByLabel("Preço");
    await price.fill("0,50");
    await expect(dialog.getByText("Informe um valor entre")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Publicar" })).toBeDisabled();
    await price.fill("29,90");
    await dialog.getByRole("button", { name: "Publicar" }).click();

    await page.waitForURL(/\/vault\/premium-/);
    const listingUrl = new URL(page.url()).pathname;
    await expect(page.getByText("R$ 29,90")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Clonar para meus projetos" }),
    ).toBeVisible();
    await expect(page.getByText("Sequência de execução")).toBeVisible();
    await expect(page.getByRole("button", { name: "Alterar preço" })).toBeVisible();

    const visitor = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    const anon = await visitor.newPage();
    await anon.goto(listingUrl);
    await expect(anon.getByText("Prévia de um projeto pago")).toBeVisible();
    await expect(anon.getByRole("button", { name: /Comprar/ })).toBeDisabled();
    await expect(
      anon.getByRole("button", { name: "Clonar para meus projetos" }),
    ).toHaveCount(0);
    await expect(anon.getByText("Sequência de execução")).toHaveCount(0);

    // The marketplace lists it under "Pagos" and not under "Grátis".
    await anon.goto(`/vault?q=${encodeURIComponent(title)}`);
    const card = anon.getByRole("article").filter({ hasText: title });
    await expect(card).toBeVisible();
    await expect(card.getByText("R$ 29,90")).toBeVisible();
    await anon.getByRole("radio", { name: "Grátis", exact: true }).click();
    await expect(anon).toHaveURL(/price=free/);
    await expect(card).toHaveCount(0);
    await anon.getByRole("radio", { name: "Pagos", exact: true }).click();
    await expect(card).toBeVisible();
    await visitor.close();

    // Back as the author: making it free unlocks it for everyone.
    await page.getByRole("button", { name: "Alterar preço" }).click();
    await page.getByRole("radio", { name: "Grátis", exact: true }).click();
    await page.getByRole("button", { name: "Salvar preço" }).click();
    await expect(page.getByText("Preço atualizado")).toBeVisible();
    const res = await page.request.get(`/api${listingUrl}`);
    expect((await res.json()).price_cents).toBe(0);
  });
});
