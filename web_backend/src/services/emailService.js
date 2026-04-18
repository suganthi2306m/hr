const nodemailer = require('nodemailer');

function createTransport() {
  const host = process.env.SMTP_HOST;
  if (!host) return null;

  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
  });
}

/**
 * Sends a one-time password for password reset.
 * If SMTP is not configured, logs the OTP on the server (development convenience only).
 */
async function sendPasswordResetOtp({ to, otp }) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@livetrack.local';
  const subject = 'LiveTrack — password reset code';
  const text =
    `Your LiveTrack password reset code is: ${otp}\n\n` +
    `It expires in 15 minutes.\n\n` +
    `If you did not request this, ignore this email.`;

  const transport = createTransport();
  if (!transport) {
    // eslint-disable-next-line no-console
    console.warn(`[password-reset] SMTP not configured. OTP for ${to}: ${otp}`);
    return { devLogged: true };
  }

  await transport.sendMail({ from, to, subject, text });
  return { devLogged: false };
}

module.exports = { sendPasswordResetOtp };
