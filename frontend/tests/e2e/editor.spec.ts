import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import { bellStateGraph } from "./helpers";

// Editor state regressions: autosave, leaving the editor, node deletion and
// undo. Runs as the shared user from auth.setup.ts; each test owns a fresh
// project so they stay independent.

type Project = { id: string; files: Array<{ id: string }> };
type Graph = {
  nodes: Array<{ id: string; position: { x: number; y: number } }>;
  edges: Array<{ source: string; target: string }>;
};

async function createProject(page: Page, name: string, graph?: object) {
  const res = await page.request.post("/api/projects", { data: { name } });
  expect(res.status()).toBe(201);
  const project: Project = await res.json();
  if (graph) {
    const patched = await page.request.patch(
      `/api/projects/${project.id}/files/${project.files[0].id}`,
      { data: { graph_json: graph } },
    );
    expect(patched.status()).toBe(200);
  }
  return project;
}

async function serverName(request: APIRequestContext, project: Project) {
  return (await (await request.get(`/api/projects/${project.id}`)).json()).name;
}

async function serverGraph(request: APIRequestContext, project: Project) {
  const res = await request.get(
    `/api/projects/${project.id}/files/${project.files[0].id}`,
  );
  return (await res.json()).graph_json as Graph;
}

test.describe("editor", () => {
  test("keeps an edit made while a save is in flight", async ({ page }) => {
    const project = await createProject(page, "Autosave");
    // Hold every project-name PATCH for 1.5 s, so the second edit below
    // lands while the first save is still on the wire.
    await page.route(`**/api/projects/${project.id}`, async (route) => {
      if (route.request().method() === "PATCH") {
        await new Promise((r) => setTimeout(r, 1500));
      }
      await route.continue();
    });

    await page.goto(`/projects/${project.id}`);
    const name = page.getByPlaceholder("Nome do projeto");
    // The store hydrates after mount; typing before that races the hydrate.
    await expect(name).toHaveValue("Autosave");
    const firstSave = page.waitForRequest(
      (r) =>
        r.method() === "PATCH" && r.url().endsWith(`/api/projects/${project.id}`),
    );
    await name.fill("Primeira versão");
    await firstSave;
    await page.waitForTimeout(1000);
    await name.fill("Versão final");

    await expect(page.getByText(/^Salvo às/)).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(() => serverName(page.request, project), { timeout: 10_000 })
      .toBe("Versão final");
  });

  test("saves pending edits when leaving the editor", async ({ page }) => {
    const project = await createProject(page, "Sair do editor");
    await page.goto(`/projects/${project.id}`);

    const name = page.getByPlaceholder("Nome do projeto");
    await expect(name).toHaveValue("Sair do editor");
    // Leave right away, well inside the 1 s autosave debounce.
    await name.fill("Nome ao sair");
    await page.getByRole("link", { name: "Voltar para projetos" }).click();
    await page.waitForURL(/\/projects$/);

    await expect
      .poll(() => serverName(page.request, project), { timeout: 10_000 })
      .toBe("Nome ao sair");
  });

  test("deleting a node from its menu also removes its edges", async ({
    page,
  }) => {
    const project = await createProject(page, "Excluir nodo", bellStateGraph());
    await page.goto(`/projects/${project.id}`);

    await page
      .locator('.react-flow__node[data-id="cnot"]')
      .click({ button: "right" });
    await page.getByRole("button", { name: "Excluir nodo" }).click();
    await expect(page.locator('.react-flow__node[data-id="cnot"]')).toHaveCount(0);

    await expect
      .poll(async () => {
        const graph = await serverGraph(page.request, project);
        return {
          hasNode: graph.nodes.some((n) => n.id === "cnot"),
          danglingEdges: graph.edges.filter(
            (e) => e.source === "cnot" || e.target === "cnot",
          ).length,
        };
      }, { timeout: 10_000 })
      .toEqual({ hasNode: false, danglingEdges: 0 });
  });

  test("undo after dragging a node puts it back where it started", async ({
    page,
  }) => {
    const project = await createProject(page, "Desfazer arrasto", bellStateGraph());
    await page.goto(`/projects/${project.id}`);

    const node = page.locator('.react-flow__node[data-id="h"]');
    const box = await node.boundingBox();
    if (!box) throw new Error("node h not rendered");
    const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(start.x + i * 15, start.y + i * 10);
    }
    await page.mouse.up();

    // The drag itself is persisted…
    await expect
      .poll(
        async () =>
          (await serverGraph(page.request, project)).nodes.find((n) => n.id === "h")
            ?.position,
        { timeout: 10_000 },
      )
      .not.toEqual({ x: 0, y: 0 });

    // …and a single Ctrl+Z restores the original position.
    await page.keyboard.press("Control+z");
    await expect
      .poll(
        async () =>
          (await serverGraph(page.request, project)).nodes.find((n) => n.id === "h")
            ?.position,
        { timeout: 10_000 },
      )
      .toEqual({ x: 0, y: 0 });
  });
});
