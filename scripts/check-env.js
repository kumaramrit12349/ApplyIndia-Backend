/**
 * Build-time guard: fails `npm run build` (before tsc runs) if the env file
 * for the target environment is missing or is missing a required value, so a
 * broken config is caught here instead of at runtime or mid-deploy.
 *
 * Usage:  node scripts/check-env.js [env]     (env defaults to $APP_ENV, then "local")
 *
 * Skipped when CI is set: env files are gitignored, and the GitHub Actions
 * pipelines supply these values as secrets only in their Deploy step, so
 * there is no env file to check at build time there.
 */
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

// Values config/env.ts reads with `!` and/or serverless.yml resolves via ${env:...} with no default.
const REQUIRED = [
  "DYNAMODB_TABLE_NAME",
  "AWS_REGION",
  "COGNITO_USER_POOL_ID",
  "COGNITO_CLIENT_ID",
  "COGNITO_DOMAIN",
  "GOOGLE_CALLBACK_URL",
  "FRONTEND_URL",
];

if (process.env.CI) {
  console.log("[check-env] CI detected — skipping env file validation.");
  process.exit(0);
}

const envName = process.argv[2] || process.env.APP_ENV || "local";
const envFile = path.resolve(__dirname, `../src/env/${envName}.env`);

if (!fs.existsSync(envFile)) {
  console.error(`[check-env] Env file not found: src/env/${envName}.env`);
  process.exit(1);
}

const fromFile = dotenv.parse(fs.readFileSync(envFile));
const missing = REQUIRED.filter((key) => !(fromFile[key] || "").trim());

if (missing.length > 0) {
  console.error(`[check-env] src/env/${envName}.env is missing required value(s):`);
  missing.forEach((key) => console.error(`  - ${key}`));
  process.exit(1);
}

console.log(`[check-env] src/env/${envName}.env OK (${REQUIRED.length} required values present).`);
