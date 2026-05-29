import { exec, execFile } from "node:child_process";
import { promisify } from "node:util";
import { app, env } from "./src/app.js";
import { ensureCatalogSeedData } from "./src/services/catalogService.js";
import { ensureSeedData } from "./src/services/userService.js";

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

async function ensureDatabaseSchema() {
  console.log("[voizn-startup] Applying Prisma schema with db push...");
  const result =
    process.platform === "win32"
      ? await execAsync("npx prisma db push", {
          cwd: process.cwd(),
          env: process.env,
        })
      : await execFileAsync("./node_modules/.bin/prisma", ["db", "push"], {
          cwd: process.cwd(),
          env: process.env,
        });
  const { stdout, stderr } = result;

  if (stdout?.trim()) {
    console.log(stdout.trim());
  }

  if (stderr?.trim()) {
    console.warn(stderr.trim());
  }
}

async function start() {
  if (env.autoDbPush) {
    await ensureDatabaseSchema();
  } else {
    console.log("[voizn-startup] Skipping Prisma db push during server startup.");
  }
  await Promise.all([ensureSeedData(), ensureCatalogSeedData()]);

  app.listen(env.port, () => {
    console.log(`VOIZN backend listening on http://127.0.0.1:${env.port}`);
  });
}

start().catch((error) => {
  console.error("Failed to start VOIZN backend:", error);
  process.exit(1);
});
