// Plug a real provider in here. Everything in the app calls only these functions.
// OTP SMS: MSG91 / Twilio / Fast2SMS.  WhatsApp: Meta WhatsApp Cloud API / Gupshup / Interakt.

export async function sendOtpSms(phone, otp) {
  console.log(`[sms] OTP for ${phone}: ${otp}`);
  // TODO: call your SMS provider here
}

export async function sendWhatsApp(phone, template, vars = {}) {
  console.log(`[whatsapp:${template}] -> ${phone}`, vars);
  // TODO: call WhatsApp Business API with an approved template
}
