// PhysioClinic WhatsApp Chatbot
// Deploy on Render.com (free) — Node.js 18+
// Required env vars: WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, VERIFY_TOKEN, ANTHROPIC_API_KEY

const express = require("express");
const axios = require("axios");
const Anthropic = require("@anthropic-ai/sdk");

const app = express();
app.use(express.json());

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── IN-MEMORY STORE ────────────────────────────────────────────────
// Replace with a real database (e.g. MongoDB Atlas free tier) for production

const patients = [
  { id: 1, name: "Priya Sharma", phone: "919810000001", condition: "Lower back pain" },
  { id: 2, name: "Arjun Mehta",  phone: "919810000002", condition: "Shoulder injury" },
];

const appointments = [
  { id: 1, patientId: 1, therapist: "Dr. Rao",   date: "2026-05-06", time: "09:00", type: "Follow-up",         status: "confirmed", amount: 1200 },
  { id: 2, patientId: 2, therapist: "Dr. Mehra", date: "2026-05-06", time: "10:00", type: "Initial Assessment", status: "confirmed", amount: 1800 },
];

let nextPatientId = 3;
let nextApptId    = 3;

// Per-user conversation history (keyed by WhatsApp phone number)
const conversations = {};

// Per-user booking flow state
const bookingState = {};

// ─── CLINIC INFO ────────────────────────────────────────────────────
const CLINIC_INFO = `
You are a WhatsApp chatbot receptionist for PhysioClinic, a physiotherapy clinic in South Delhi, India.

CLINIC DETAILS:
- Hours: Monday–Saturday, 8:00 AM – 6:00 PM (Closed Sundays)
- Location: South Delhi (patients can ask for exact address, tell them to reply "address")

THERAPISTS:
- Dr. Rao       – Back & spine specialist
- Dr. Mehra     – Sports injuries specialist  
- Dr. Singh     – Post-surgery rehabilitation

PRICING:
- Initial Assessment:      ₹1,800
- Follow-up Session:       ₹1,200
- Walk-in Consultation:    ₹900
- Review Session:          ₹1,000
- Physiotherapy Session:   ₹1,500

PAYMENT: Online (UPI/Card) or pay at clinic.

YOUR CAPABILITIES — tell users you can help with:
1. Book a new appointment
2. Check pricing and timings
3. View or cancel their appointment
4. Reschedule an appointment
5. Payment confirmation queries
6. Connect to a human receptionist

INSTRUCTIONS:
- Be warm, concise, and professional
- Use simple English (users may also write in Hinglish — respond in the same language)
- Always end with a helpful follow-up offer
- For booking: collect name, phone, preferred date, time, and type of appointment step by step
- If user says "human" or "speak to someone" or "receptionist" — tell them to call +91-XXXXXXXXXX or you will escalate
- Never make up information — if unsure, say "Let me connect you to our reception team"
- Format important info clearly using line breaks
- Keep responses under 300 words
`;

// ─── SEND WHATSAPP MESSAGE ───────────────────────────────────────────
async function sendMessage(to, text) {
  try {
    await axios.post(
      `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (err) {
    console.error("Send error:", err.response?.data || err.message);
  }
}

// ─── SEND WHATSAPP TEMPLATE (for reminders / confirmations) ─────────
// Note: Templates must be pre-approved by Meta before use in production
async function sendTemplate(to, templateName, params = []) {
  try {
    await axios.post(
      `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: templateName,
          language: { code: "en" },
          components: params.length > 0 ? [{
            type: "body",
            parameters: params.map(p => ({ type: "text", text: p })),
          }] : [],
        },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (err) {
    console.error("Template error:", err.response?.data || err.message);
  }
}

// ─── GET AI REPLY ────────────────────────────────────────────────────
async function getAIReply(userPhone, userMessage) {
  // Initialize conversation history for new users
  if (!conversations[userPhone]) {
    conversations[userPhone] = [];
  }

  const history = conversations[userPhone];

  // Check for appointment-related keywords to inject context
  const lowerMsg = userMessage.toLowerCase();
  let contextNote = "";

  // Find patient by phone
  const cleanPhone = userPhone.replace(/\D/g, "");
  const patient = patients.find(p => p.phone.replace(/\D/g, "") === cleanPhone);

  if (patient) {
    const myAppts = appointments.filter(a => a.patientId === patient.id && a.status === "confirmed");
    if (myAppts.length > 0 && (lowerMsg.includes("appointment") || lowerMsg.includes("booking") || lowerMsg.includes("cancel") || lowerMsg.includes("reschedule"))) {
      contextNote = `\n\nCURRENT PATIENT CONTEXT: This is ${patient.name}. Their upcoming appointments:\n` +
        myAppts.map(a => `- ${a.type} with ${a.therapist} on ${a.date} at ${a.time} (₹${a.amount})`).join("\n");
    }
  }

  // Add user message to history
  history.push({ role: "user", content: userMessage });

  // Keep history to last 10 messages to avoid token overload
  const recentHistory = history.slice(-10);

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 400,
      system: CLINIC_INFO + contextNote,
      messages: recentHistory,
    });

    const reply = response.content[0].text;

    // Add assistant reply to history
    history.push({ role: "assistant", content: reply });

    // Handle booking intent — extract and save if AI confirms a booking
    if (lowerMsg.includes("confirm") && bookingState[userPhone]?.ready) {
      const bs = bookingState[userPhone];
      const newAppt = {
        id: nextApptId++,
        patientId: patient?.id || 0,
        therapist: bs.therapist || "Dr. Rao",
        date: bs.date,
        time: bs.time,
        type: bs.type || "Initial Assessment",
        status: "confirmed",
        amount: 1800,
      };
      appointments.push(newAppt);
      delete bookingState[userPhone];

      // Send confirmation after a short delay
      setTimeout(() => sendBookingConfirmation(userPhone, newAppt, patient?.name || "Patient"), 1000);
    }

    return reply;
  } catch (err) {
    console.error("AI error:", err.message);
    return "Sorry, I'm having a technical issue right now. Please call us at +91-XXXXXXXXXX or try again in a moment.";
  }
}

// ─── BOOKING CONFIRMATION MESSAGE ────────────────────────────────────
async function sendBookingConfirmation(phone, appt, name) {
  const msg =
    `✅ *Appointment Confirmed!*\n\n` +
    `👤 Patient: ${name}\n` +
    `📋 Type: ${appt.type}\n` +
    `👨‍⚕️ Therapist: ${appt.therapist}\n` +
    `📅 Date: ${appt.date}\n` +
    `🕐 Time: ${appt.time}\n` +
    `💰 Fee: ₹${appt.amount.toLocaleString()}\n\n` +
    `Payment can be done online or at the clinic.\n\n` +
    `We'll send you a reminder 24 hours before. See you soon! 🙏\n` +
    `— PhysioClinic Team`;
  await sendMessage(phone, msg);
}

// ─── APPOINTMENT REMINDER (call this from a cron job) ────────────────
// Example: run this every day at 9 AM using node-cron
// npm install node-cron — then add to your index.js:
//
// const cron = require("node-cron");
// cron.schedule("0 9 * * *", sendDailyReminders);
//
async function sendDailyReminders() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split("T")[0];

  const tomorrowAppts = appointments.filter(
    a => a.date === tomorrowStr && a.status === "confirmed"
  );

  for (const appt of tomorrowAppts) {
    const patient = patients.find(p => p.id === appt.patientId);
    if (!patient) continue;

    const msg =
      `🔔 *Appointment Reminder*\n\n` +
      `Hi ${patient.name}! This is a reminder for your appointment tomorrow.\n\n` +
      `📋 ${appt.type}\n` +
      `👨‍⚕️ ${appt.therapist}\n` +
      `📅 ${appt.date} at ${appt.time}\n` +
      `💰 Fee: ₹${appt.amount.toLocaleString()}\n\n` +
      `Reply *CANCEL* to cancel or *RESCHEDULE* to change your appointment.\n` +
      `— PhysioClinic`;

    await sendMessage(patient.phone, msg);
    console.log(`Reminder sent to ${patient.name} (${patient.phone})`);
  }
}

// ─── PAYMENT CONFIRMATION MESSAGE ────────────────────────────────────
async function sendPaymentConfirmation(phone, name, amount, apptType) {
  const msg =
    `✅ *Payment Received!*\n\n` +
    `Hi ${name}, your payment has been confirmed.\n\n` +
    `💰 Amount: ₹${amount.toLocaleString()}\n` +
    `📋 For: ${apptType}\n\n` +
    `Thank you! See you at your appointment. 🙏\n` +
    `— PhysioClinic`;
  await sendMessage(phone, msg);
}

// ─── WEBHOOK VERIFICATION (Meta requires this) ───────────────────────
app.get("/webhook", (req, res) => {
  const mode      = req.query["hub.mode"];
  const token     = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.VERIFY_TOKEN) {
    console.log("Webhook verified ✅");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// ─── INCOMING MESSAGE HANDLER ─────────────────────────────────────────
app.post("/webhook", async (req, res) => {
  res.sendStatus(200); // Always respond 200 immediately to Meta

  try {
    const body = req.body;
    if (body.object !== "whatsapp_business_account") return;

    const entry   = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value   = changes?.value;
    const message = value?.messages?.[0];

    if (!message || message.type !== "text") return;

    const from = message.from;           // e.g. "919876543210"
    const text = message.text.body.trim();

    console.log(`📩 From ${from}: ${text}`);

    // Handle special commands
    const lower = text.toLowerCase();

    if (lower === "hi" || lower === "hello" || lower === "start") {
      const patient = patients.find(p => p.phone.replace(/\D/g, "") === from.replace(/\D/g, ""));
      const greeting = patient
        ? `👋 Welcome back, *${patient.name}*!\n\nHow can I help you today?\n\n1️⃣ Book appointment\n2️⃣ View my appointments\n3️⃣ Cancel / reschedule\n4️⃣ Pricing & timings\n5️⃣ Talk to a human\n\nJust type your question or choose a number!`
        : `👋 Welcome to *PhysioClinic*!\n\nI'm your virtual receptionist. I can help you:\n\n1️⃣ Book an appointment\n2️⃣ Check pricing & timings\n3️⃣ Talk to a human receptionist\n\nJust type your question or reply with a number!`;
      await sendMessage(from, greeting);
      return;
    }

    if (lower === "address") {
      await sendMessage(from, "📍 *PhysioClinic Address*\n\n123 Wellness Lane, South Delhi - 110017\n\nNear XYZ Metro Station, Gate 2.\n\n🗺️ Google Maps: https://maps.google.com/?q=South+Delhi\n\nOpen Mon–Sat, 8 AM – 6 PM");
      return;
    }

    if (lower === "cancel" || lower === "reschedule") {
      const patient = patients.find(p => p.phone.replace(/\D/g, "") === from.replace(/\D/g, ""));
      if (patient) {
        const myAppts = appointments.filter(a => a.patientId === patient.id && a.status === "confirmed");
        if (myAppts.length > 0) {
          const apptList = myAppts.map((a, i) => `${i+1}. ${a.type} — ${a.date} at ${a.time} with ${a.therapist}`).join("\n");
          await sendMessage(from, `Your upcoming appointments:\n\n${apptList}\n\nReply with the number to ${lower}, or type your query for more options.`);
        } else {
          await sendMessage(from, "You have no upcoming appointments. Would you like to book one? Just say *book* to get started!");
        }
      } else {
        await sendMessage(from, "I couldn't find your records. Please register at our clinic or call us at +91-XXXXXXXXXX.");
      }
      return;
    }

    if (lower === "human" || lower === "receptionist" || lower === "speak to someone") {
      await sendMessage(from, "👩‍💼 *Connecting you to our reception team*\n\nOur receptionist will contact you shortly.\n\n📞 You can also call us directly:\n+91-XXXXXXXXXX\n\n⏰ Available Mon–Sat, 8 AM – 6 PM\n\nIs there anything else I can help you with?");
      // Here you'd also notify your staff via email/Slack
      return;
    }

    // All other messages — handled by AI
    const reply = await getAIReply(from, text);
    await sendMessage(from, reply);

  } catch (err) {
    console.error("Webhook error:", err.message);
  }
});

// ─── HEALTH CHECK ─────────────────────────────────────────────────────
app.get("/", (req, res) => res.send("PhysioClinic WhatsApp Bot is running ✅"));

// ─── START SERVER ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Bot running on port ${PORT}`));