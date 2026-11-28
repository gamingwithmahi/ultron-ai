"use strict";

module.exports = async function bootstrapInitialAdmin({ store, persist, audit, hashPassword, env = process.env }) {
  const username = env.ULTRON_BOOTSTRAP_ADMIN_USERNAME;
  const password = env.ULTRON_BOOTSTRAP_ADMIN_PASSWORD;

  if (!username && !password) return false;
  if (store.admin) return false;

  if (
    typeof username !== "string" ||
    !/^[a-zA-Z0-9_.-]{3,32}$/.test(username) ||
    typeof password !== "string" ||
    password.length < 20 ||
    password.length > 128
  ) {
    throw new Error("Invalid ULTRON bootstrap administrator configuration");
  }

  store.admin = {
    username,
    password: await hashPassword(password),
    createdAt: new Date().toISOString()
  };
  audit("admin.created", "Initial administrator provisioned securely");
  await persist();
  return true;
};
