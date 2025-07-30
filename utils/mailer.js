const nodemailer=require('nodemailer');
const dotenv=require('dotenv');
dotenv.config();

const transporter=nodemailer.createTransport(
    {
        service:'Gmail',
        auth:{
            user:process.env.EMAIL_USER,
            pass:process.env.EMAIL_PASS
        }
    }
)

const sendOTPEmail=async(to,otp)=>{
    await transporter.sendMail({
        from:`"QuickMediLink" <${process.env.EMAIL_USER}>`,
        to,
        subject:'Email Verification OTP',
        html:`
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2>Email Verification</h2>
        <p>Your OTP code is: <strong style="font-size: 22px; color: #2563eb;">${otp}</strong></p>
        <p>This code expires in 10 minutes.</p>
      </div>
    `


    });
};
module.exports = sendOTPEmail;