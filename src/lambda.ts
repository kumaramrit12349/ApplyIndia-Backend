import serverless from "serverless-http";
import app from "./app";
import { initAdminRoleSystem } from "./middlewares/authMiddleware";

// Initialize admin role system on Lambda cold start
initAdminRoleSystem().catch((err) =>
  console.error("[Lambda] Failed to init admin role system:", err)
);

export const handler = serverless(app);