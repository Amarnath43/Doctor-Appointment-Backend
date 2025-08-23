const { sendEmail } = require('./index');

async function sendOTPEmail(to, { otp, name }) {
  const subject = 'Email Verification OTP';
  const html = `
    <div style="font-family: Arial, sans-serif; padding: 20px;">
      <h2>Email Verification</h2>
      <p>Hi ${name || 'there'},</p>
      <p>Your OTP code is:
        <strong style="font-size:22px;color:#2563eb;">${otp}</strong>
      </p>
      <p>This code expires in 10 minutes.</p>
    </div>`;
  const text = `Your OTP is ${otp} (expires in 10 minutes)`;
  return sendEmail({ to, subject, html, text });
}

module.exports = { sendOTPEmail };
