import "./config/env";
import app from "./app";
import { ENV } from "./config/env";
import { initAdminRoleSystem } from "./middlewares/authMiddleware";

if (ENV.APP_ENV !== "prod") {
  app.listen(ENV.PORT, async () => {
    console.log(`Server running on http://localhost:${ENV.PORT}`);
    // Initialize admin role system: seed defaults + populate cache
    await initAdminRoleSystem();
  });
}