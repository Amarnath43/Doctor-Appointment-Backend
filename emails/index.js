const formData = require('form-data');
const Mailgun = require('mailgun.js');

const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY; 
const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN;
const MAIL_FROM = `QuickMediLink <noreply@mg.quickmedilink.online>`; 

const mailgun = new Mailgun(formData);

const mg = mailgun.client({
  username: 'api',
  key: MAILGUN_API_KEY,
});


async function sendEmail({ to, subject, html, text }) {
  if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN) {
    throw new Error("Mailgun credentials (API Key or Domain) are not configured.");
  }
  
  const messageData = {
    from: MAIL_FROM,
    to: to,
    subject: subject,
    html: html,
    text: text,
  };

  try {
    const response = await mg.messages.create(MAILGUN_DOMAIN, messageData);
    return response; 
  } catch (error) {
    console.error("Mailgun API Send Error:", error);
    throw error;
  }
}

module.exports = { sendEmail };