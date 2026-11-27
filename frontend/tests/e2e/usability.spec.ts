import { expect, test, type Page } from "@playwright/test";

// Usability improvements: public home page, empty-canvas onboarding with
// the Bell-state example, quick guide, real Stop button with live output,
// (the public feedback wall has its own spec, feedback.spec.ts).

type Project = { id: string; files: Array<{ id: string }> };

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

test.describe("home page (visitor)", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("explains the product and leads to sign-up", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Monte circuitos quânticos arrastando blocos" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Como funciona" })).toBeVisible();
    await page.getByRole("link", { name: "Criar conta grátis" }).first().click();
    await expect(page).toHaveURL(/\/register$/);
  });

  test("is available in English", async ({ page }) => {
    await page.goto("/en");
    await expect(
      page.getByRole("heading", { name: "Build quantum circuits by dragging blocks" }),
    ).toBeVisible();
  });
});

test.describe("usability", () => {
  test("signed-in users skip the home page", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/projects$/);
  });

  test("empty canvas offers the Bell example, which runs", async ({ page }) => {
    test.setTimeout(120_000);
    const project = await createProject(page, "Onboarding");
    await page.goto(`/projects/${project.id}`);

    await expect(page.getByText("Seu circuito começa aqui")).toBeVisible();
    await page.getByRole("button", { name: "Carregar exemplo: estado de Bell" }).click();
    await expect(page.getByText("Seu circuito começa aqui")).toBeHidden();

    await page.getByRole("button", { name: "Executar" }).click();
    await expect(page.getByText("Concluído")).toBeVisible({ timeout: 90_000 });
    await expect(page.getByAltText("histogram.png")).toBeVisible();

    // The example was saved, not only drawn.
    const file = await (
      await page.request.get(`/api/projects/${project.id}/files/${project.files[0].id}`)
    ).json();
    expect(file.graph_json.nodes).toHaveLength(6);
    expect(file.graph_json.edges).toHaveLength(5);
  });

  test("quick guide opens from the top bar", async ({ page }) => {
    const project = await createProject(page, "Guia");
    await page.goto(`/projects/${project.id}`);
    await page.getByRole("button", { name: "Guia rápido", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Guia rápido do editor")).toBeVisible();
    await expect(dialog.getByText("Termine com Run")).toBeVisible();
  });

  test("Stop ends a long run and output shows up while it runs", async ({ page }) => {
    test.setTimeout(120_000);
    // A class decorator that prints, then sleeps past any reasonable wait:
    // only Stop can end this run before the executor timeout.
    const project = await createProject(page, "Stop", {
      config: { num_qubits: 1, num_classical: 1, shots: 10 },
      nodes: [],
      edges: [],
      variables: [],
      functions: [
        {
          id: "f",
          name: "slow",
          return_type: "None",
          parameters: [{ name: "c", type: "Int" }],
          body: "import time\nprint('started', flush=True)\ntime.sleep(25)\nreturn c",
        },
      ],
      classes: [
        {
          id: "c",
          name: "Waiter",
          parent_class: "",
          decorators: ["slow"],
          variables: [],
          methods: [],
        },
      ],
    });
    await page.goto(`/projects/${project.id}`);

    const stop = page.getByRole("button", { name: "Parar execução" });
    await expect(stop).toBeDisabled();
    await page.getByRole("button", { name: "Executar" }).click();

    // Live output: printed before the script ends.
    await expect(page.locator("pre").filter({ hasText: "started" })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/Executando há \d+s/)).toBeVisible();

    await stop.click();
    await expect(page.getByText("Interrompido")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Execution stopped by the user")).toBeVisible();
    await expect(stop).toBeDisabled();
    await expect(page.getByRole("button", { name: "Executar" })).toBeEnabled();
  });
});
