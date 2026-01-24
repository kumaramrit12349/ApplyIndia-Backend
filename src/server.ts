import app from "./app";
import { ENV } from "./config/env";

if (ENV.APP_ENV !== "prod") {
  app.listen(ENV.PORT, () => {
    console.log(`Server running on http://localhost:${ENV.PORT}`);
  });
}
