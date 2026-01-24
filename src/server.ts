import app from "./app";
import { DYNAMODB_CONFIG, ENV } from "./config/env";

if (ENV.RUNTIME_ENV !== "lambda") {
  app.listen(ENV.PORT, () => {
    if (!DYNAMODB_CONFIG.TABLE_NAME) {
      throw new Error("DYNAMODB_TABLE_NAME is not defined");
    }
    console.log(`Server running on http://localhost:${ENV.PORT}`);
  });
}
