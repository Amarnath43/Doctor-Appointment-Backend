const formData = require('form-data');
const Mailgun = require('mailgun.js');

// ---------------------------------------------------------
// PASTE YOUR NEW KEY INSIDE THE QUOTES BELOW (Keep the 'key-' prefix!)
const MY_FRESH_KEY = 'key-81de593b2f2309a44c686703f13a1a4f-235e4bb2-845c9cb1'; 
// ---------------------------------------------------------

const mailgun = new Mailgun(formData);
const mg = mailgun.client({
  username: 'api', 
  key: MY_FRESH_KEY, 
});

async function runTest() {
  console.log("Attempting to send with key:", MY_FRESH_KEY.substring(0, 10) + "...");

  try {
    const result = await mg.messages.create('mg.quickmedilink.online', {
      from: 'Test <noreply@mg.quickmedilink.online>',
      to: 'your-actual-email@gmail.com', // <--- PUT YOUR PERSONAL EMAIL HERE
      subject: 'Mailgun Auth Test',
      text: 'If you get this, the key works!'
    });
    console.log("✅ SUCCESS! The key is valid.");
    console.log(result);
  } catch (error) {
    console.error("❌ FAILURE. The key is rejected.");
    console.error(error);
  }
}

runTest();