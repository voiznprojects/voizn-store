import { app, env } from "./src/app.js";
import { ensureSeedData } from "./src/services/userService.js";

ensureSeedData()
  .then(() => {
    app.listen(env.port, () => {
      console.log(`VOIZN backend listening on http://127.0.0.1:${env.port}`);
    });
  })
  .catch((error) => {
    console.error("Failed to start VOIZN backend:", error);
    process.exit(1);
  });
