// PhysioClinic WhatsApp Chatbot
// Groq AI + MongoDB — data permanently saved
// Env vars: WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, VERIFY_TOKEN, GROQ_API_KEY, MONGODB_URI

const express  = require("express");
const axios    = require("axios");
const mongoose = require("mongoose");

const app = express();
app.use(express.json());

// ─── CONNECT TO MONGODB (optional — bot works without it too) ───────
let dbConnected = false;
if (process.env.MONGODB_URI) {
  mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
      dbConnected = true;
      console.log("✅ MongoDB connected successfully");
    })
    .catch(err => console.error("⚠️ MongoDB not connected — running without database:", err.message));
} else {
  console.log("⚠️ No MONGODB_URI — running without database");
}

// ─── SCHEMAS & MODELS ────────────────────────────────────────────────

const patientSchema = new mongoose.Schema({
  name:      { type: String, required: true },
  phone:     { type: String, required: true, unique: true },
  condition: String,
  address:   String,
  email:     String,
  notes:     String,
  createdAt: { type: Date, default: Date.now }
});

const appointmentSchema = new mongoose.Schema({
  patientId:  { type: mongoose.Schema.Types.ObjectId, ref: "Patient" },
  patientName:String,
  patientPhone:String,
  therapist:  String,
  date:       String,
  time:       String,
  type:       String,
  status:     { type: String, default: "confirmed" },
  payStatus:  { type: String, default: "pending" },
  amount:     Number,
  createdAt:  { type: Date, default: Date.now }
});

const Patient     = mongoose.model("Patient",     patientSchema);
const Appointment = mongoose.model("Appointment", appointmentSchema);

// Per-user conversation history (in-memory is fine for this)
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
5. Payment queries
6. Connect to a human receptionist

RULES:
- Be warm, friendly and concise
- If user writes in Hindi or Hinglish, reply in same language
- For booking: collect name, phone, preferred date, time, type step by step
- If user says human or receptionist, give clinic phone number
- Never make up information
- Keep replies under 150 words
- No markdown symbols like ** or ##`;

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
    console.log(`✅ Sent to ${to}`);
  } catch (err) {
    console.error("Send error:", err.response?.data || err.message);
  }
}

// ─── GET AI REPLY FROM GROQ ──────────────────────────────────────────
async function getAIReply(userPhone, userMessage, contextNote = "") {
  if (!conversations[userPhone]) conversations[userPhone] = [];
  const history = conversations[userPhone];

  history.push({ role: "user", content: userMessage });
  const recentHistory = history.slice(-10);

  try {
    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.3-70b-versatile",
        max_tokens: 300,
        temperature: 0.7,
        messages: [
          { role: "system", content: SYSTEM_PROMPT + contextNote },
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
      || "Sorry, please call us at +91-XXXXXXXXXX.";

    history.push({ role: "assistant", content: reply });
    if (history.length > 20) history.splice(0, 2);

    return reply;
  } catch (err) {
    console.error("Groq error:", err.response?.data || err.message);
    return "Sorry, I am having a technical issue. Please call +91-XXXXXXXXXX.";
  }
}

// ─── SAVE APPOINTMENT TO MONGODB ────────────────────────────────────
async function saveAppointment(data) {
  try {
    const appt = new Appointment(data);
    await appt.save();
    console.log(`✅ Appointment saved: ${data.patientName} - ${data.type}`);
    return appt;
  } catch (err) {
    console.error("Save appointment error:", err.message);
    return null;
  }
}

// ─── SAVE PATIENT TO MONGODB ─────────────────────────────────────────
async function savePatient(data) {
  try {
    const existing = await Patient.findOne({ phone: data.phone });
    if (existing) return existing;
    const patient = new Patient(data);
    await patient.save();
    console.log(`✅ Patient saved: ${data.name}`);
    return patient;
  } catch (err) {
    console.error("Save patient error:", err.message);
    return null;
  }
}

// ─── WEBHOOK VERIFICATION ────────────────────────────────────────────
app.get("/webhook", (req, res) => {
  const mode      = req.query["hub.mode"];
  const token     = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.VERIFY_TOKEN) {
    console.log("✅ Webhook verified");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// ─── INCOMING MESSAGE HANDLER ─────────────────────────────────────────
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  try {
    const body    = req.body;
    if (body.object !== "whatsapp_business_account") return;

    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!message || message.type !== "text") return;

    const from  = message.from;
    const text  = message.text.body.trim();
    const lower = text.toLowerCase();

    console.log(`📩 From ${from}: ${text}`);

    // ── Auto-save new patient on first message ────────────────────
    const cleanPhone = from.replace(/\D/g, "");
    let existingPatient = null;
    if (dbConnected) {
      existingPatient = await Patient.findOne({ phone: cleanPhone });
      if (!existingPatient) {
        existingPatient = await Patient.create({
          name: `Patient ${cleanPhone.slice(-4)}`,
          phone: cleanPhone,
          notes: `First message: "${text}"`,
        });
        console.log(`✅ New patient saved: ${cleanPhone}`);
      }
    }

    // ── Auto-detect and save appointment from conversation ────────
    if (dbConnected && existingPatient) {
      const datePattern = /\b(\d{4}-\d{2}-\d{2}|today|tomorrow|\d{1,2}(?:st|nd|rd|th)?(?:\s+\w+)?)\b/i;
      const timePattern = /\b(\d{1,2}(?::\d{2})?\s*(?:am|pm)|\d{2}:\d{2})\b/i;
      const therapistPattern = /dr\.?\s*(rao|mehra|singh)/i;
      const typePattern = /(initial assessment|follow.?up|walk.?in|review|physiotherapy)/i;

      const hasDate = datePattern.test(text);
      const hasTime = timePattern.test(text);
      const bookingWords = ["book","appointment","schedule","confirm","fix appointment","slot"];
      const isBooking = bookingWords.some(k => lower.includes(k));

      if (isBooking && (hasDate || hasTime)) {
        // Extract details
        const therapistMatch = text.match(therapistPattern);
        const typeMatch = text.match(typePattern);
        const timeMatch = text.match(timePattern);

        // Determine date
        let apptDate = new Date().toISOString().split("T")[0]; // today
        if (lower.includes("tomorrow")) {
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          apptDate = tomorrow.toISOString().split("T")[0];
        }
        const explicitDate = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
        if (explicitDate) apptDate = explicitDate[1];

        // Format time
        let apptTime = "10:00";
        if (timeMatch) {
          const t = timeMatch[1].toLowerCase().replace(/\s/g, "");
          if (t.includes("am") || t.includes("pm")) {
            const num = parseInt(t);
            const isPm = t.includes("pm");
            const hour = isPm && num !== 12 ? num + 12 : (!isPm && num === 12 ? 0 : num);
            apptTime = `${String(hour).padStart(2, "0")}:00`;
          } else {
            apptTime = t;
          }
        }

        const apptType = typeMatch
          ? typeMatch[1].charAt(0).toUpperCase() + typeMatch[1].slice(1)
          : "Initial Assessment";

        const therapist = therapistMatch
          ? `Dr. ${therapistMatch[1].charAt(0).toUpperCase() + therapistMatch[1].slice(1)}`
          : "Dr. Rao";

        const priceMap = {
          "Initial assessment": 1800, "Follow-up": 1200,
          "Walk-in": 900, "Review": 1000, "Physiotherapy": 1500
        };
        const amount = Object.entries(priceMap).find(([k]) =>
          apptType.toLowerCase().includes(k.toLowerCase()))?.[1] || 1200;

        // Save appointment
        const existing = await Appointment.findOne({
          patientPhone: cleanPhone,
          date: apptDate,
          time: apptTime
        });

        if (!existing) {
          await Appointment.create({
            patientId: existingPatient._id,
            patientName: existingPatient.name,
            patientPhone: cleanPhone,
            therapist,
            date: apptDate,
            time: apptTime,
            type: apptType,
            status: "confirmed",
            payStatus: "pending",
            amount
          });
          console.log(`✅ Appointment saved: ${existingPatient.name} — ${apptDate} at ${apptTime}`);
        }
      }
    }

    // ── Special commands ──────────────────────────────────────────

    if (["hi", "hello", "start", "hey"].includes(lower)) {
      const greeting = existingPatient
        ? `Welcome back, ${existingPatient.name}!\n\nHow can I help you today?\n\n1. Book appointment\n2. My appointments\n3. Cancel or reschedule\n4. Pricing and timings\n5. Talk to a human\n\nJust type your question!`
        : `Welcome to PhysioClinic!\n\nI am your virtual receptionist. I can help you:\n\n1. Book an appointment\n2. Check pricing and timings\n3. Talk to a human receptionist\n\nJust type your question!`;
      await sendMessage(from, greeting);
      return;
    }

    if (lower === "address") {
      await sendMessage(from, "PhysioClinic\n\n123 Wellness Lane\nSouth Delhi - 110017\n\nNear XYZ Metro Station, Gate 2\n\nOpen Mon-Sat, 8 AM to 6 PM");
      return;
    }

    if (lower === "my appointments") {
      if (existingPatient) {
        const appts = await Appointment.find({
          patientPhone: cleanPhone,
          status: "confirmed"
        }).sort({ createdAt: -1 }).limit(5);

        if (appts.length > 0) {
          const list = appts.map((a, i) =>
            `${i + 1}. ${a.type}\n   ${a.therapist} — ${a.date} at ${a.time}\n   Payment: ${a.payStatus}`
          ).join("\n\n");
          await sendMessage(from, `Your appointments:\n\n${list}`);
        } else {
          await sendMessage(from, "You have no upcoming appointments. Type BOOK to schedule one!");
        }
      } else {
        await sendMessage(from, "I could not find your records. Please register by booking an appointment.");
      }
      return;
    }

    if (lower === "cancel" || lower === "reschedule") {
      if (existingPatient) {
        const appts = await Appointment.find({ patientPhone: cleanPhone, status: "confirmed" });
        if (appts.length > 0) {
          const list = appts.map((a, i) => `${i + 1}. ${a.type} on ${a.date} at ${a.time}`).join("\n");
          await sendMessage(from, `Your appointments:\n\n${list}\n\nPlease call us at +91-XXXXXXXXXX to ${lower}.`);
        } else {
          await sendMessage(from, "No upcoming appointments found.");
        }
      } else {
        await sendMessage(from, "Records not found. Please call +91-XXXXXXXXXX.");
      }
      return;
    }

    if (["human", "receptionist", "speak to someone"].includes(lower)) {
      await sendMessage(from,
        "Connecting you to our team.\n\nCall us:\n+91-XXXXXXXXXX\n\nMon-Sat, 8 AM to 6 PM"
      );
      return;
    }

    // ── Add patient context for AI ────────────────────────────────
    let contextNote = "";
    if (existingPatient) {
      const recentAppts = await Appointment.find({ patientPhone: cleanPhone }).sort({ createdAt: -1 }).limit(3);
      if (recentAppts.length > 0) {
        contextNote = `\n\nPatient context: This is ${existingPatient.name}. Recent appointments: ` +
          recentAppts.map(a => `${a.type} on ${a.date}`).join(", ");
      }
    }

    // ── Groq AI handles everything else ──────────────────────────
    const reply = await getAIReply(from, text, contextNote);
    await sendMessage(from, reply);

    // ── Auto-save if booking detected ────────────────────────────
    const bookingKeywords = ["book", "appointment", "schedule", "fix appointment"];
    if (bookingKeywords.some(k => lower.includes(k))) {
      console.log(`📅 Booking intent detected from ${from}`);
    }

  } catch (err) {
    console.error("Webhook error:", err.message);
  }
});

// ─── API ENDPOINTS (for Doctor Dashboard) ────────────────────────────

// Get all patients
app.get("/api/patients", async (req, res) => {
  try {
    const patients = await Patient.find().sort({ createdAt: -1 });
    res.json(patients);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all appointments
app.get("/api/appointments", async (req, res) => {
  try {
    const appointments = await Appointment.find().sort({ createdAt: -1 });
    res.json(appointments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add patient manually
app.post("/api/patients", async (req, res) => {
  try {
    const patient = new Patient(req.body);
    await patient.save();
    res.json(patient);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add appointment manually
app.post("/api/appointments", async (req, res) => {
  try {
    const appt = new Appointment(req.body);
    await appt.save();
    res.json(appt);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── HEALTH CHECK ─────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({
    status: "running",
    message: "PhysioClinic WhatsApp Bot",
    database: mongoose.connection.readyState === 1 ? "connected" : "disconnected"
  });
});

// ─── START SERVER ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Bot running on port ${PORT}`));
