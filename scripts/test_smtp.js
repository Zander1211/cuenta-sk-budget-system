import nodemailer from 'nodemailer'

const gmailUser = 'johnzanderzerrudo@gmail.com'
const gmailPass = 'ntadigrhaogzeoiv'

console.log('Testing SMTP connection...')
console.log('User:', gmailUser)
console.log('Pass length:', gmailPass.length, 'chars')
console.log('Pass (masked):', gmailPass.substring(0, 4) + '****' + gmailPass.substring(gmailPass.length - 4))

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: gmailUser,
    pass: gmailPass,
  },
})

transporter.verify()
  .then(() => {
    console.log('\n✅ SMTP connection SUCCESSFUL! Gmail credentials are valid.')
  })
  .catch((err) => {
    console.error('\n❌ SMTP connection FAILED:', err.message)
    console.log('\nPossible fixes:')
    console.log('1. Make sure 2-Step Verification is ON at: https://myaccount.google.com/signinoptions/two-step-verification')
    console.log('2. Create a NEW App Password at: https://myaccount.google.com/apppasswords')
    console.log('3. The password must be 16 characters with NO spaces')
    console.log('4. Make sure you are generating the App Password for the same Google account: ' + gmailUser)
  })
