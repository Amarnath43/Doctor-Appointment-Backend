const { sendEmail } = require('./index');

async function sendWelcomeUserEmail(to, { name }) {
  const subject = 'Welcome to QuickMediLink 🎉';
  const appUrl = process.env.APP_URL || 'https://quickmedilink.in';

  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;line-height:1.6">
      <h2>Welcome to QuickMediLink 🎉</h2>
      <p>Hi ${name},</p>
      <p>Thanks for signing up! You can now book, reschedule, and join secure consultations.</p>
      <p style="margin:20px 0">
        <a href="${appUrl}"
           style="display:inline-block;padding:10px 16px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px">
          Get Started
        </a>
      </p>
    </div>`;
  return sendEmail({ to, subject, html });
}

module.exports = { sendWelcomeUserEmail };
