const nodemailer = require('nodemailer');

const EMAIL_USER = process.env.SES_SMTP_USER; 
const EMAIL_PASS = process.env.SES_SMTP_PASS;
const SES_REGION = process.env.SES_REGION || "ap-south-1"; 
const MAIL_FROM  = `QuickMediLink <no-reply@quickmedilink.in>`; 

const transporter = nodemailer.createTransport({
  host: `email-smtp.${SES_REGION}.amazonaws.com`,
  port: 587, // TLS
  secure: false,
  auth: { user: EMAIL_USER, pass: EMAIL_PASS }
});


async function sendEmail({ to, subject, html, text }) {
  return transporter.sendMail({
    from: MAIL_FROM,
    to,
    subject,
    html,
    text
  });
}

module.exports = { sendEmail };
