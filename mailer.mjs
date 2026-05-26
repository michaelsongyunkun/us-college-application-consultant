import nodemailer from "nodemailer";

const PASSWORD_RESET_SUBJECT = "重置你的登录密码";
const DEFAULT_QQ_SMTP_USER = "3152482377@qq.com";

export function resolveSmtpConfig(env = process.env) {
  return {
    host: env.SMTP_HOST || "smtp.qq.com",
    port: Number(env.SMTP_PORT || 465),
    secure: env.SMTP_SECURE ? env.SMTP_SECURE === "true" : true,
    user: env.SMTP_USER || DEFAULT_QQ_SMTP_USER,
    pass: env.SMTP_PASS || "",
    from: env.SMTP_FROM || `US College Consultant <${DEFAULT_QQ_SMTP_USER}>`,
  };
}

export function createMailerFromEnv(env = process.env) {
  const config = resolveSmtpConfig(env);
  const missing = [];
  if (!config.pass) missing.push("SMTP_PASS");

  if (missing.length > 0) {
    return {
      async sendPasswordResetEmail() {
        throw new Error(`Missing SMTP configuration: ${missing.join(", ")}`);
      },
    };
  }

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });

  return {
    async sendPasswordResetEmail({ to, resetUrl }) {
      await transporter.sendMail({
        from: config.from,
        to,
        subject: PASSWORD_RESET_SUBJECT,
        text: [
          "你正在重置美本申请规划工具的登录密码。",
          "",
          "请在 30 分钟内打开以下链接设置新密码：",
          resetUrl,
          "",
          "如果这不是你本人操作，可以忽略这封邮件。",
        ].join("\n"),
      });
    },
  };
}
