import { writeFileSync } from "node:fs";

import { test as setup } from "@playwright/test";

import { AUTH_STATE_FILE, AUTH_USER_FILE, registerAndLogin } from "./helpers";

// One shared, logged-in user for every spec that is not about auth itself.
// /auth/register is limited to 3/minute per IP, so registering per test
// caps the suite at two or three specs; this keeps it at one register (plus
// the auth spec's own) no matter how many specs exist.
setup("register and log in the shared e2e user", async ({ page }) => {
  const user = await registerAndLogin(page);
  await page.context().storageState({ path: AUTH_STATE_FILE });
  writeFileSync(AUTH_USER_FILE, JSON.stringify(user));
});
