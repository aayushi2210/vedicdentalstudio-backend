// PhysioClinic WhatsApp Chatbot
// Uses Groq AI (FREE — 14,400 requests/day, super fast)
// Deploy on Render.com
// Env vars: WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, VERIFY_TOKEN, GROQ_API_KEY

const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// ─── IN-MEMORY STORE ────────────────────────────────────────────────
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

// Per-user conversation history
const conversations = {};

// ─── CLINIC SYSTEM PROMPT ───────────────────────────────────────────
const SYSTEM_PROMPT = `You are a WhatsApp chatbot receptionist for PhysioClinic, a physiotherapy clinic in South Delhi, India.

CLINIC DETAILS:
- Hours: Monday to Saturday, 8:00 AM to 6:00 PM. Closed Sundays.
- Location: South Delhi

THERAPISTS:
- Dr. Rao: Back and spine specialist
- Dr. Mehra: Sports injuries specialist
- Dr. Singh: Post-surgery rehabilitation

PRICING:
- Initial Assessment: Rs 1800
- Follow-up Session: Rs 1200
- Walk-in Consultation: Rs 900
- Review Session: Rs 1000
- Physiotherapy Session: Rs 1500

PAYMENT: Online (UPI or Card) or pay at clinic.

YOU CAN HELP WITH:
1. Book a new appointment
2. Check pricing and timings
3. View or cancel appointments
4. Reschedule appointments
5. Payment confirmation queries
6. Connect to a human receptionist

RULES:
- Be warm, friendly and concise
- If user writes in Hindi or Hinglish, reply in the same language
- For booking: collect name, phone, preferred date, time, appointment type step by step
- If user says human or receptionist, give them the clinic phone number
- Never make up information
- Keep replies under 150 words
- Do not use markdown symbols like ** or ## or *`;

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
    console.log(`✅ Message sent to ${to}`);
  } catch (err) {
    console.error("Send error:", JSON.stringify(err.response?.data || err.message, null, 2));
  }
}

// ─── GET AI REPLY FROM GROQ (FREE & FAST) ───────────────────────────
async function getAIReply(userPhone, userMessage) {
  if (!conversations[userPhone]) {
    conversations[userPhone] = [];
  }

  const history = conversations[userPhone];

  // Check if existing patient
  const cleanPhone = userPhone.replace(/\D/g, "");
  const patient = patients.find(p => p.phone.replace(/\D/g, "") === cleanPhone);

  // Add patient context if found
  let contextNote = "";
  if (patient) {
    const myAppts = appointments.filter(a => a.patientId === patient.id && a.status === "confirmed");
    if (myAppts.length > 0) {
      contextNote = `\nThis patient is ${patient.name}. Their appointments: ` +
        myAppts.map(a => `${a.type} with ${a.therapist} on ${a.date} at ${a.time}`).join(", ");
    }
  }

  // Add to history
  history.push({ role: "user", content: userMessage });

  // Keep last 10 messages only
  const recentHistory = history.slice(-10);

  try {
    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.3-70b-versatile", // Free, fast Llama 3 model
        max_tokens: 300,
        temperature: 0.7,
        messages: [
          {
            role: "system",
            content: SYSTEM_PROMPT + contextNote
          },
          ...recentHistory
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json",
        }
      }
    );

    const reply = response.data?.choices?.[0]?.message?.content
      || "Sorry, I could not process your request. Please call us at +91-XXXXXXXXXX.";

    // Save reply to history
    history.push({ role: "assistant", content: reply });

    // Keep history manageable
    if (history.length > 20) history.splice(0, 2);

    return reply;

  } catch (err) {
    console.error("Groq AI error:", JSON.stringify(err.response?.data || err.message, null, 2));
    return "Sorry, I am having a technical issue. Please call us at +91-XXXXXXXXXX or try again shortly.";
  }
}

// ─── BOOKING CONFIRMATION ────────────────────────────────────────────
async function sendBookingConfirmation(phone, appt, name) {
  const msg =
    `Appointment Confirmed!\n\n` +
    `Patient: ${name}\n` +
    `Type: ${appt.type}\n` +
    `Therapist: ${appt.therapist}\n` +
    `Date: ${appt.date}\n` +
    `Time: ${appt.time}\n` +
    `Fee: Rs ${appt.amount}\n\n` +
    `Payment can be done online or at the clinic.\n` +
    `See you soon!\n- PhysioClinic`;
  await sendMessage(phone, msg);
}

// ─── DAILY REMINDERS ─────────────────────────────────────────────────
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
      `Appointment Reminder\n\n` +
      `Hi ${patient.name}! Your appointment is tomorrow.\n\n` +
      `${appt.type}\n` +
      `${appt.therapist}\n` +
      `${appt.date} at ${appt.time}\n` +
      `Fee: Rs ${appt.amount}\n\n` +
      `Reply CANCEL to cancel or RESCHEDULE to change.\n` +
      `- PhysioClinic`;

    await sendMessage(patient.phone, msg);
    console.log(`Reminder sent to ${patient.name}`);
  }
}

// ─── WEBHOOK VERIFICATION ────────────────────────────────────────────
app.get("/webhook", (req, res) => {
  const mode      = req.query["hub.mode"];
  const token     = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.VERIFY_TOKEN) {
    console.log("Webhook verified successfully");
    res.status(200).send(challenge);
  } else {
    console.error("Webhook verification failed");
    res.sendStatus(403);
  }
});

// ─── INCOMING MESSAGE HANDLER ─────────────────────────────────────────
app.post("/webhook", async (req, res) => {
  res.sendStatus(200); // Always respond immediately

  try {
    const body    = req.body;
    if (body.object !== "whatsapp_business_account") return;

    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!message || message.type !== "text") return;

    const from  = message.from;
    const text  = message.text.body.trim();
    const lower = text.toLowerCase();

    console.log(`📩 Message from ${from}: ${text}`);

    // ── Special commands ──────────────────────────────────────────

    if (["hi", "hello", "start", "hey"].includes(lower)) {
      const patient = patients.find(p => p.phone.replace(/\D/g, "") === from.replace(/\D/g, ""));
      const greeting = patient
        ? `Welcome back, ${patient.name}!\n\nHow can I help you today?\n\n1. Book appointment\n2. View my appointments\n3. Cancel or reschedule\n4. Pricing and timings\n5. Talk to a human\n\nJust type your question!`
        : `Welcome to PhysioClinic!\n\nI am your virtual receptionist. I can help you:\n\n1. Book an appointment\n2. Check pricing and timings\n3. Talk to a human receptionist\n\nJust type your question!`;
      await sendMessage(from, greeting);
      return;
    }

    if (lower === "address") {
      await sendMessage(from,
        "PhysioClinic Address\n\n123 Wellness Lane, South Delhi - 110017\n\nNear XYZ Metro Station, Gate 2.\n\nOpen Monday to Saturday, 8 AM to 6 PM"
      );
      return;
    }

    if (lower === "cancel" || lower === "reschedule") {
      const patient = patients.find(p => p.phone.replace(/\D/g, "") === from.replace(/\D/g, ""));
      if (patient) {
        const myAppts = appointments.filter(a => a.patientId === patient.id && a.status === "confirmed");
        if (myAppts.length > 0) {
          const list = myAppts.map((a, i) => `${i + 1}. ${a.type} on ${a.date} at ${a.time} with ${a.therapist}`).join("\n");
          await sendMessage(from, `Your upcoming appointments:\n\n${list}\n\nPlease call us at +91-XXXXXXXXXX to ${lower}.`);
        } else {
          await sendMessage(from, "You have no upcoming appointments. Type BOOK to schedule one!");
        }
      } else {
        await sendMessage(from, "I could not find your records. Please call us at +91-XXXXXXXXXX.");
      }
      return;
    }

    if (["human", "receptionist", "speak to someone", "call me"].includes(lower)) {
      await sendMessage(from,
        "Connecting you to our reception team.\n\nPlease call us directly:\n+91-XXXXXXXXXX\n\nAvailable Monday to Saturday, 8 AM to 6 PM.\n\nIs there anything else I can help you with?"
      );
      return;
    }

    // ── All other messages go to Groq AI ─────────────────────────
    const reply = await getAIReply(from, text);
    await sendMessage(from, reply);

  } catch (err) {
    console.error("Webhook error:", err.message);
  }
});

// ─── HEALTH CHECK ─────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.send("PhysioClinic WhatsApp Bot is running with Groq AI!");
});

// ─── START SERVER ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Bot running on port ${PORT}`));
