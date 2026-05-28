import assert from "node:assert/strict";
import { createMailerFromEnv, resolveSmtpConfig } from "../src/server/mailer.mjs";

assert.deepEqual(resolveSmtpConfig({}), {
  host: "",
  port: 465,
  secure: true,
  user: "",
  pass: "",
  from: "",
});

assert.deepEqual(resolveSmtpConfig({ SMTP_HOST: "smtp.qq.com", SMTP_USER: "sender@qq.com", SMTP_PASS: "auth-code" }), {
  host: "smtp.qq.com",
  port: 465,
  secure: true,
  user: "sender@qq.com",
  pass: "auth-code",
  from: "US College Consultant <sender@qq.com>",
});

assert.deepEqual(
  resolveSmtpConfig({
    SMTP_HOST: "smtp.example.com",
    SMTP_PORT: "587",
    SMTP_SECURE: "false",
    SMTP_USER: "sender@example.com",
    SMTP_PASS: "secret",
    SMTP_FROM: "Sender <sender@example.com>",
  }),
  {
    host: "smtp.example.com",
    port: 587,
    secure: false,
    user: "sender@example.com",
    pass: "secret",
    from: "Sender <sender@example.com>",
  },
);

await assert.rejects(
  () => createMailerFromEnv({}).sendPasswordResetEmail(),
  /Missing SMTP configuration: SMTP_HOST, SMTP_USER, SMTP_PASS/,
);
