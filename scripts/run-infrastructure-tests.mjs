process.env.RUN_INFRASTRUCTURE_TESTS = "1";
await import("../tests/infrastructure-testcontainers.test.mjs");
