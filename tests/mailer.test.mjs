import assert from "node:assert/strict";
import { resolveSmtpConfig } from "../mailer.mjs";

assert.deepEqual(resolveSmtpConfig({ SMTP_PASS: "auth-code" }), {
  host: "smtp.qq.com",
  port: 465,
  secure: true,
  user: "3152482377@qq.com",
  pass: "auth-code",
  from: "US College Consultant <3152482377@qq.com>",
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
