const { sendEmail } = require('./index');

async function sendWelcomeDoctorEmail(to, { name }) {
  const subject = 'Welcome to QuickMediLink for Doctors 👨‍⚕️👩‍⚕️';
  const doctorUrl = process.env.DOCTOR_APP_URL || process.env.APP_URL || 'https://quickmedilink.example/doctor';

  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;line-height:1.6">
      <h2>Welcome to QuickMediLink, Dr. ${name}!</h2>
      <p>Your doctor account is live. You can set availability, manage bookings, and consult patients.</p>
      <p style="margin:20px 0">
        <a href="${doctorUrl}"
           style="display:inline-block;padding:10px 16px;background:#16a34a;color:#fff;text-decoration:none;border-radius:8px">
          Go to Doctor Portal
        </a>
      </p>
    </div>`;
  return sendEmail({ to, subject, html });
}

module.exports = { sendWelcomeDoctorEmail };
