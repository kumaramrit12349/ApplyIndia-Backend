import app from "./app";
import { DYNAMODB_CONFIG, ENV } from "./config/env";

app.listen(ENV.PORT, () => {
  console.log("BOOT ENV FILE:", process.env.DYNAMODB_TABLE_NAME);
  if (!DYNAMODB_CONFIG.TABLE_NAME) {
    throw new Error("DYNAMODB_TABLE_NAME is not defined");
  }
  if (ENV.APP_ENV !== "prod") {
    console.log(`Server running on http://localhost:${ENV.PORT}`);
  }
});
