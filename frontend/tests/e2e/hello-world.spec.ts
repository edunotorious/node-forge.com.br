import { expect, test } from "@playwright/test";

import { bellStateGraph } from "./helpers";

test.describe("Hello World — Bell state", () => {
  // Generous timeout: cold-start of the runner container + Aer simulator
  // ~1-3 s, plus the BackgroundTask + 500 ms client poll cadence. We give
  // it 90 s to absorb cold caches on a CI runner.
  test.setTimeout(120_000);

  test("end-to-end run produces 00/11 counts only", async ({ page }) => {
    // Create a fresh project via the BFF API (the page.request context
    // shares the cookies set by the browser, so this hits the same
    // authenticated surface).
    const created = await page.request.post("/api/projects", {
      data: { name: "E2E Hello World" },
    });
    expect(created.status()).toBe(201);
    const project: { id: string; files: Array<{ id: string }> } =
      await created.json();
    expect(project.files).toHaveLength(1);
    const fileId = project.files[0].id;

    // Seed the default file with a fully-wired Bell state graph. Skipping
    // the canvas drag-and-drop here is deliberate: React Flow's HTML5 DnD
    // is flaky to drive over the CDP wire. The codegen + executor
    // pipeline is what we care about, and the graph_json is what the UI
    // would have produced anyway.
    const patched = await page.request.patch(
      `/api/projects/${project.id}/files/${fileId}`,
      { data: { graph_json: bellStateGraph() } },
    );
    expect(patched.status()).toBe(200);

    // Open the editor. fitView animates briefly; the run button is in
    // the file-tabs bar above the canvas so it doesn't depend on the
    // canvas being ready.
    await page.goto(`/projects/${project.id}`);
    await expect(page.getByText("Arquivo 1")).toBeVisible();

    // RunControls uses aria-label = i18n editor.runControls.play, which
    // resolves to "Executar" in pt-BR.
    await page.getByRole("button", { name: "Executar" }).click();

    // Run triggers a redirect to the Console tab; the success badge
    // shows up once the polling sees status=succeeded.
    await expect(page.getByText("Concluído")).toBeVisible({
      timeout: 90_000,
    });

    // stdout from the Aer simulator. The Bell state Φ+ produces only
    // |00⟩ and |11⟩ — measuring |01⟩ or |10⟩ is impossible by quantum
    // semantics, not just unlikely. So we assert the presence of both
    // pairs AND the absence of the others.
    const consoleText = await page
      .locator("pre")
      .filter({ hasText: "Counts:" })
      .innerText();

    expect(consoleText).toMatch(/'00':\s*\d+/);
    expect(consoleText).toMatch(/'11':\s*\d+/);
    expect(consoleText).not.toMatch(/'01':/);
    expect(consoleText).not.toMatch(/'10':/);

    await test.step("publish the circuit to the Vault", async () => {
      await page.getByRole("button", { name: "Publicar no Vault" }).click();

      // The title field is seeded from the project name on every open.
      const dialog = page.getByRole("dialog");
      const title = dialog.getByLabel("Título");
      await expect(title).toHaveValue("E2E Hello World");

      // Edits are discarded on close; the seed comes back on reopen.
      await title.fill("Rascunho descartado");
      await dialog.getByRole("button", { name: "Cancelar" }).click();
      await expect(dialog).toBeHidden();
      await page.getByRole("button", { name: "Publicar no Vault" }).click();
      await expect(title).toHaveValue("E2E Hello World");

      const unique = `E2E Vault ${Date.now().toString(36)}`;
      await title.fill(unique);
      await dialog
        .getByRole("button", { name: "Publicar", exact: true })
        .click();
      await expect(page.getByText("Publicado no Vault")).toBeVisible();

      const listed = await page.request.get(
        `/api/vault?q=${encodeURIComponent(unique)}`,
      );
      expect(listed.status()).toBe(200);
      const listings: Array<{ title: string }> = await listed.json();
      expect(listings.map((l) => l.title)).toEqual([unique]);
    });
  });
});
