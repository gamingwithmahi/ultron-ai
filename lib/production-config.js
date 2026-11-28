"use strict";

const REQUIRED_PRODUCTION_SECRETS = [
  ["ULTRON_SETUP_KEY", 32],
  ["ULTRON_SESSION_SECRET", 32],
  ["ULTRON_TOKEN_ENCRYPTION_KEY", 32]
];

function validateProductionEnvironment(env = process.env) {
  if (env.NODE_ENV !== "production") return [];

  const errors = [];
  for (const [name, minimumLength] of REQUIRED_PRODUCTION_SECRETS) {
    const value = typeof env[name] === "string" ? env[name].trim() : "";
    if (!value || value.length < minimumLength || /^(replace-with-|your-)/i.test(value)) {
      errors.push(name + " must be configured with at least " + minimumLength + " characters");
    }
  }

  const pgSslMode = String(env.PGSSLMODE || "require").toLowerCase();
  if (!["require", "verify-full"].includes(pgSslMode)) {
    errors.push("PGSSLMODE must require TLS in production; disable is local-only");
  }

  const databaseUrl = typeof env.DATABASE_URL === "string" ? env.DATABASE_URL.trim() : "";
  if (!databaseUrl) {
    errors.push("DATABASE_URL is required for durable production storage");
  } else {
    try {
      const parsed = new URL(databaseUrl);
      if (!["postgres:", "postgresql:"].includes(parsed.protocol) || !parsed.hostname) {
        errors.push("DATABASE_URL must be a valid PostgreSQL connection URL");
      }
    } catch {
      errors.push("DATABASE_URL must be a valid PostgreSQL connection URL");
    }
  }

  return errors;
}

module.exports = { validateProductionEnvironment };
