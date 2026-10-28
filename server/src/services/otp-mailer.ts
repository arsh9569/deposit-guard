import { env } from '../config/env.js';
import nodemailer from 'nodemailer';

export async function sendOtpEmail(
  recipientEmail: string,
  otp: string,
): Promise<void> {
  const smtpUser = env.SMTP_USER;
  const smtpPassword = env.SMTP_APP_PASSWORD;

  if (!smtpUser || !smtpPassword) {
    throw new Error('SMTP credentials are not configured');
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: smtpUser,
      pass: smtpPassword,
    },
  });

  await transporter.sendMail({
    from: `"NidhiKosh" <${smtpUser}>`,
    to: recipientEmail,
    subject: 'NidhiKosh - Email Verification OTP',
    text: [
      'Welcome to NidhiKosh!',
      '',
      `Your email verification code is: ${otp}`,
      '',
      'This code expires in 5 minutes.',
      'If you did not request this code, ignore this email.',
    ].join('\n'),
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:28px;border:1px solid #e2e8f0;border-radius:12px">
        <h2 style="color:#173a60">NidhiKosh</h2>
        <p>Email Verification</p>
        <p>Use the following code to verify your email address:</p>
        <div style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#175da5;padding:20px;background:#eef4fc;text-align:center;border-radius:8px">
          ${otp}
        </div>
        <p style="color:#64748b;font-size:13px">This code expires in 5 minutes.</p>
        <p style="color:#64748b;font-size:13px">If you did not request this code, you can ignore this email.</p>
      </div>
    `,
  });
}
