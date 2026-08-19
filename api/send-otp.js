// /api/send-otp.js
// Generates a 6-digit OTP, stores it in the verification_codes table,
// and sends it to the provided Gmail address via Nodemailer + Gmail SMTP.

import nodemailer from 'nodemailer'
import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { email } = req.body

  if (!email) {
    return res.status(400).json({ error: 'Email is required' })
  }

  // Validate Gmail
  const isGmail = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i.test(email)
  if (!isGmail) {
    return res.status(400).json({ error: 'Only Gmail addresses are allowed.' })
  }

  try {
    // Generate a secure 6-digit OTP
    const otp = String(Math.floor(100000 + Math.random() * 900000))

    // Store in database with 10-minute expiry
    const supabaseUrl = process.env.VITE_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Delete any existing codes for this email first
    await supabase.from('verification_codes').delete().eq('email', email)

    // Insert the new code
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 minutes
    const { error: dbError } = await supabase.from('verification_codes').insert({
      email,
      code: otp,
      expires_at: expiresAt,
      verified: false,
    })

    if (dbError) {
      console.error('[send-otp] DB error:', dbError)
      return res.status(500).json({ error: 'Failed to generate verification code. Please try again.' })
    }

    // Send the email via Gmail SMTP
    const gmailUser = process.env.GMAIL_USER
    const gmailAppPassword = process.env.GMAIL_APP_PASSWORD

    if (!gmailUser || !gmailAppPassword) {
      console.error('[send-otp] Missing GMAIL_USER or GMAIL_APP_PASSWORD env vars')
      return res.status(500).json({ error: 'Email service is not configured. Please contact the administrator.' })
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: gmailUser,
        pass: gmailAppPassword,
      },
    })

    const mailOptions = {
      from: `"Cuenta System" <${gmailUser}>`,
      to: email,
      subject: 'Your Cuenta Verification Code',
      html: `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
          <div style="text-align: center; margin-bottom: 24px;">
            <h2 style="color: #0c2e30; margin: 0;">Cuenta</h2>
            <p style="color: #6b7280; font-size: 14px; margin: 4px 0 0;">SK Budget Monitoring System</p>
          </div>
          <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 24px; text-align: center;">
            <p style="color: #374151; font-size: 14px; margin: 0 0 16px;">Your verification code is:</p>
            <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #0c2e30; padding: 12px 0;">
              ${otp}
            </div>
            <p style="color: #6b7280; font-size: 12px; margin: 16px 0 0;">This code expires in 10 minutes.</p>
          </div>
          <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 24px;">
            If you did not request this code, please ignore this email.
          </p>
        </div>
      `,
    }

    const info = await transporter.sendMail(mailOptions)
    console.log('[send-otp] Email sent successfully:', info.messageId)

    return res.status(200).json({ success: true, message: 'Verification code sent successfully.' })
  } catch (err) {
    console.error('[send-otp] Error:', err)
    return res.status(500).json({ error: 'Failed to send verification email: ' + err.message })
  }
}
