// backend/src/services/email.js
const nodemailer = require('nodemailer');

let transporter;

function createTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const secure = (process.env.SMTP_SECURE === 'true' || process.env.SMTP_SECURE === '1');

  // Safe: log AFTER host/port/secure are initialized
  console.log("⚙️ Creating transporter with:", {
    host,
    port,
    secure,
    user: process.env.SMTP_USER ? "✔ loaded" : "❌ missing",
  });

  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  transporter.verify((err, success) => {
    console.log("🔍 verify callback reached");
    if (err) {
      console.error("❌ SMTP verify FAILED:", {
        message: err?.message,
        code: err?.code,
        response: err?.response
      });
    } else {
      console.log("✅ Nodemailer transporter ready");
    }
  });

  return transporter;
}

/**
 * sendEmail(opts) where opts are nodemailer mail options:
 * { to, from, subject, text, html, replyTo }
 */
async function sendEmail(mailOptions = {}) {
  // Example inside sendEmail function
function isValidEmail(addr) {
  return typeof addr === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr);
}

module.exports = async function sendEmail(opts = {}) {
  const { to, from } = opts;
  if (!to || !isValidEmail(to)) {
    throw new Error("sendEmail: 'to' address is missing or invalid");
  }
  if (!from || !isValidEmail(from)) {
    throw new Error("sendEmail: 'from' address is missing or invalid");
  }

  // existing nodemailer logic...
};

  try {
    const t = createTransporter();

    const defaultFrom = process.env.FROM_EMAIL || `no-reply@${process.env.SMTP_HOST || 'localhost'}`;

    const fullMail = {
      from: mailOptions.from || defaultFrom,
      to: mailOptions.to,
      subject: mailOptions.subject || '(No subject)',
      text: mailOptions.text,
      html: mailOptions.html,
      replyTo: mailOptions.replyTo
    };

    const info = await t.sendMail(fullMail);
    // Log send result for debugging
    console.log("📤 Quote email sent:", {
      messageId: info && info.messageId,
      accepted: info && info.accepted,
      rejected: info && info.rejected
    });
    return info;
  } catch (err) {
    // Bubble a detailed error up so the route can log it too
    console.error('❌ FULL ERROR (sendEmail):', {
      message: err?.message,
      code: err?.code,
      response: err?.response,
      stack: err?.stack
    });
    throw err;
  }
}

module.exports = sendEmail;
