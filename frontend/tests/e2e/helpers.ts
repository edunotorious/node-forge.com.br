import type { Page } from "@playwright/test";

/**
 * Generate a unique-per-run test user. Timestamp + random suffix keeps
 * conflicts impossible even when tests retry. Domain `example.com` is
 * accepted by EmailStr at the schema layer (test-local.* would be rejected
 * by python-email-validator as reserved).
 */
export function makeTestUser(): { email: string; password: string } {
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return {
    email: `e2e-${stamp}-${rand}@example.com`,
    password: "e2e-test-password-12345",
  };
}

/**
 * Register a user via the UI, then sign in. Returns the credentials so
 * the caller can re-authenticate later if needed.
 *
 * Goes through real form submissions so the test exercises the same
 * surface a human would. The trailing `await expect(page).toHaveURL(...)`
 * acts as the synchronisation point — Playwright waits until we land on
 * /projects before yielding.
 */
export async function registerAndLogin(
  page: Page,
): Promise<{ email: string; password: string }> {
  const user = makeTestUser();

  await page.goto("/register");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Senha").fill(user.password);
  await page.getByRole("button", { name: "Criar conta" }).click();

  // POST /api/auth/register redirects the form to /login?registered=1.
  await page.waitForURL(/\/login/);

  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Senha").fill(user.password);
  await page.getByRole("button", { name: "LOGIN" }).click();

  await page.waitForURL(/\/projects/, { timeout: 15_000 });
  return user;
}

/**
 * Bell state circuit (Φ⁺). Hand-built graph_json shape that matches what
 * the editor would have produced if a user dragged the nodes into place.
 * The codegen on the backend turns this into the canonical
 * `h(0) → cx(0,1) → measure → measure → run` Qiskit script.
 */
export function bellStateGraph() {
  return {
    config: { num_qubits: 2, num_classical: 2, shots: 1000 },
    variables: [],
    functions: [],
    classes: [],
    nodes: [
      {
        id: "h",
        type: "qiskit.hadamard",
        position: { x: 0, y: 0 },
        data: { qubit_index: 0 },
      },
      {
        id: "cnot",
        type: "qiskit.cnot",
        position: { x: 200, y: 0 },
        data: { control_qubit: 0, target_qubit: 1 },
      },
      {
        id: "m0",
        type: "qiskit.measure",
        position: { x: 400, y: 0 },
        data: { qubit_index: 0, classical_index: 0 },
      },
      {
        id: "m1",
        type: "qiskit.measure",
        position: { x: 600, y: 0 },
        data: { qubit_index: 1, classical_index: 1 },
      },
      {
        id: "run",
        type: "qiskit.run_local_simulator",
        position: { x: 800, y: 0 },
        data: { shots: 1000 },
      },
    ],
    edges: [
      { id: "e1", source: "h", target: "cnot" },
      { id: "e2", source: "cnot", target: "m0" },
      { id: "e3", source: "m0", target: "m1" },
      { id: "e4", source: "m1", target: "run" },
    ],
  };
}
