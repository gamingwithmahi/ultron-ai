"use strict";

function createShutdownHandler({
  server,
  worker = null,
  pool = null,
  logger = console,
  exit = code => process.exit(code),
  timeoutMs = 10000
}) {
  if (!server || typeof server.close !== "function") {
    throw new TypeError("A running HTTP server is required");
  }

  let shutdownPromise = null;

  return function shutdown(signal = "shutdown") {
    if (shutdownPromise) return shutdownPromise;

    logger.info?.("ULTRON graceful shutdown started:", signal);
    const timeout = setTimeout(() => {
      logger.error?.("ULTRON graceful shutdown timed out");
      try {
        server.closeAllConnections?.();
      } finally {
        exit(1);
      }
    }, timeoutMs);
    timeout.unref?.();

    shutdownPromise = (async () => {
      try {
        await new Promise((resolve, reject) => {
          server.close(error => error ? reject(error) : resolve());
        });
        if (worker && typeof worker.stop === "function") await worker.stop();
        if (pool && typeof pool.end === "function") await pool.end();
        clearTimeout(timeout);
        logger.info?.("ULTRON graceful shutdown completed");
        return true;
      } catch (error) {
        clearTimeout(timeout);
        logger.error?.("ULTRON graceful shutdown failed:", error);
        exit(1);
        return false;
      }
    })();

    return shutdownPromise;
  };
}

module.exports = { createShutdownHandler };
