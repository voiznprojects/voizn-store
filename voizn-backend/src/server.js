import { app, env } from "./app.js";
import { ensureSeedData } from "./services/userService.js";

ensureSeedData()
  .then(() => {
    app.listen(env.port, "0.0.0.0", () => {
      console.log(`VOIZN backend listening on port ${env.port}`);
    });
  })
  .catch((error) => {
    console.error("Failed to start VOIZN backend:", error);
    process.exit(1);
  });
