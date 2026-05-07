// PhysioClinic WhatsApp Chatbot
// Groq AI + MongoDB — data permanently saved
// Env vars: WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, VERIFY_TOKEN, GROQ_API_KEY, MONGODB_URI

const express  = require("express");
const axios    = require("axios");
const mongoose = require("mongoose");

const app = express();
app.use(express.json());

// ─── CORS — allow all origins ────────────────────────────────────────
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

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
        // New patient — save with temp name and ask for real name
        existingPatient = await Patient.create({
          name: `Patient ${cleanPhone.slice(-4)}`,
          phone: cleanPhone,
          notes: `First message: "${text}"`,
        });
        console.log(`✅ New patient saved: ${cleanPhone}`);

        // Ask for name before proceeding
        await sendMessage(from,
          `Welcome to PhysioClinic! 🏥\n\nTo serve you better, may I know your name please?`
        );

        // Save state — waiting for name
        conversations[from] = conversations[from] || [];
        conversations[from].push({ role: "system", content: "WAITING_FOR_NAME" });
        return;
      }

      // Check if waiting for name
      const history = conversations[from] || [];
      const waitingForName = history.some(m => m.content === "WAITING_FOR_NAME");

      if (waitingForName) {
        // Save the name patient just typed
        const patientName = text.trim();
        await Patient.findByIdAndUpdate(existingPatient._id, {
          name: patientName,
          notes: existingPatient.notes
        });
        existingPatient.name = patientName;

        // Remove waiting state
        conversations[from] = history.filter(m => m.content !== "WAITING_FOR_NAME");

        console.log(`✅ Patient name updated: ${patientName}`);

        await sendMessage(from,
          `Thank you, ${patientName}! 😊\n\nHow can I help you today?\n\n1. Book an appointment\n2. Check pricing and timings\n3. Talk to a human receptionist\n\nJust type your question!`
        );
        return;
      }
    }

    // ── Auto-detect and save appointment using AI extraction ─────
    if (dbConnected && existingPatient) {
      const bookingWords = ["book","appointment","schedule","confirm","fix","slot","visit","tomorrow","today","morning","afternoon","evening","am","pm","baje","kal","aaj"];
      const isBooking = bookingWords.some(k => lower.includes(k));

      if (isBooking) {
        try {
          // Build full conversation context for better extraction
          const convHistory = (conversations[from] || [])
            .filter(m => m.role && m.content && !m.appointmentList)
            .slice(-10)
            .map(m => `${m.role === "user" ? "Patient" : "Bot"}: ${m.content}`)
            .join("\n");

          const fullContext = `${convHistory}\nPatient: ${text}`;

          const extractRes = await axios.post(
            "https://api.groq.com/openai/v1/chat/completions",
            {
              model: "llama-3.3-70b-versatile",
              max_tokens: 200,
              temperature: 0,
              messages: [
                {
                  role: "system",
                  content: `Extract appointment details from this conversation. Today is ${new Date().toISOString().split("T")[0]}. Tomorrow is ${new Date(Date.now()+86400000).toISOString().split("T")[0]}.
Return ONLY a valid JSON object:
{
  "hasAppointment": true/false,
  "date": "YYYY-MM-DD or null",
  "time": "HH:MM or null",
  "therapist": "Dr. Rao or Dr. Mehra or Dr. Singh or null",
  "type": "Initial Assessment or Follow-up or Walk-in or Review or Physiotherapy Session or null",
  "payMode": "online or clinic or null"
}
Rules:
- "tomorrow"/"kal" = ${new Date(Date.now()+86400000).toISOString().split("T")[0]}
- "today"/"aaj" = ${new Date().toISOString().split("T")[0]}
- "12 PM" = "12:00", "2pm" = "14:00", "10am" = "10:00"
- "at clinic" = payMode clinic
- hasAppointment = true only if BOTH date AND time are found
Return ONLY the JSON, no other text.`
                },
                { role: "user", content: fullContext }
              ]
            },
            {
              headers: {
                Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
                "Content-Type": "application/json",
              }
            }
          );

          const extractedText = extractRes.data?.choices?.[0]?.message?.content || "{}";
          const clean = extractedText.replace(/```json|```/g, "").trim();
          const extracted = JSON.parse(clean);

          console.log("Extracted appointment data:", JSON.stringify(extracted));

          if (extracted.hasAppointment && extracted.date && extracted.time) {
            const priceMap = {
              "Initial Assessment": 1800,
              "Follow-up": 1200,
              "Walk-in": 900,
              "Review": 1000,
              "Physiotherapy Session": 1500
            };

            const apptType = extracted.type || "Initial Assessment";
            const amount = priceMap[apptType] || 1200;
            const therapist = extracted.therapist || "Dr. Rao";
            const payMode = extracted.payMode || "pending";

            // Check duplicate
            const existing = await Appointment.findOne({
              patientPhone: cleanPhone,
              date: extracted.date,
              time: extracted.time,
              status: "confirmed"
            });

            if (!existing) {
              await Appointment.create({
                patientId: existingPatient._id,
                patientName: existingPatient.name,
                patientPhone: cleanPhone,
                therapist,
                date: extracted.date,
                time: extracted.time,
                type: apptType,
                status: "confirmed",
                payStatus: payMode === "clinic" ? "clinic" : "pending",
                amount
              });
              console.log(`✅ Appointment saved: ${existingPatient.name} — ${extracted.date} at ${extracted.time}`);
            } else {
              console.log(`ℹ️ Appointment already exists: ${cleanPhone} on ${extracted.date}`);
            }
          } else {
            console.log("ℹ️ Not enough info to save appointment yet");
          }
        } catch (extractErr) {
          console.log("Appointment extraction error:", extractErr.message);
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

    // ── My Appointments ───────────────────────────────────────────
    if (lower === "my appointments" || lower === "appointments" || lower === "my bookings") {
      if (existingPatient) {
        const appts = await Appointment.find({
          patientPhone: cleanPhone,
          status: "confirmed"
        }).sort({ date: 1 }).limit(5);

        if (appts.length > 0) {
          const list = appts.map((a, i) =>
            `${i + 1}. ${a.type}\n   👨‍⚕️ ${a.therapist}\n   📅 ${a.date} at ${a.time}\n   💰 ${a.payStatus === "paid" ? "Paid ✅" : a.payStatus === "clinic" ? "Pay at clinic 🏥" : "Pending ⚠️"}`
          ).join("\n\n");
          await sendMessage(from,
            `📋 Your Upcoming Appointments\n\n${list}\n\nTo cancel, reply:\nCANCEL 1 (for appointment 1)\nCANCEL 2 (for appointment 2)`
          );
          // Save appointments in memory for cancel reference
          conversations[from] = conversations[from] || [];
          conversations[from] = conversations[from].filter(m => !m.appointmentList);
          conversations[from].push({ appointmentList: appts.map(a => a._id.toString()) });
        } else {
          await sendMessage(from,
            `You have no upcoming appointments.\n\nType BOOK to schedule one! 📅`
          );
        }
      } else {
        await sendMessage(from,
          `I could not find your records.\n\nPlease message us to register and book an appointment.`
        );
      }
      return;
    }

    // ── Cancel Appointment ────────────────────────────────────────
    if (lower.startsWith("cancel")) {
      if (existingPatient) {
        // Check if they said "CANCEL 1" or "CANCEL 2" etc
        const numMatch = text.match(/cancel\s+(\d+)/i);

        if (numMatch) {
          const idx = parseInt(numMatch[1]) - 1;
          const history = conversations[from] || [];
          const apptListEntry = history.find(m => m.appointmentList);

          if (apptListEntry && apptListEntry.appointmentList[idx]) {
            const apptId = apptListEntry.appointmentList[idx];
            const appt = await Appointment.findById(apptId);

            if (appt && appt.status === "confirmed") {
              await Appointment.findByIdAndUpdate(apptId, { status: "cancelled" });
              console.log(`✅ Appointment cancelled: ${apptId}`);
              await sendMessage(from,
                `✅ Appointment Cancelled\n\n${appt.type}\n${appt.therapist}\n${appt.date} at ${appt.time}\n\nYour appointment has been cancelled successfully.\n\nTo book a new appointment, type BOOK. 📅`
              );
            } else {
              await sendMessage(from, "This appointment is already cancelled or not found.");
            }
          } else {
            // Show appointments first then ask to cancel
            const appts = await Appointment.find({
              patientPhone: cleanPhone,
              status: "confirmed"
            }).sort({ date: 1 }).limit(5);

            if (appts.length > 0) {
              const list = appts.map((a, i) =>
                `${i + 1}. ${a.type} — ${a.date} at ${a.time}`
              ).join("\n");
              conversations[from] = conversations[from] || [];
              conversations[from] = conversations[from].filter(m => !m.appointmentList);
              conversations[from].push({ appointmentList: appts.map(a => a._id.toString()) });
              await sendMessage(from,
                `Which appointment do you want to cancel?\n\n${list}\n\nReply:\nCANCEL 1\nCANCEL 2\netc.`
              );
            } else {
              await sendMessage(from, "You have no upcoming appointments to cancel.");
            }
          }
        } else {
          // Just said "cancel" without number — show list
          const appts = await Appointment.find({
            patientPhone: cleanPhone,
            status: "confirmed"
          }).sort({ date: 1 }).limit(5);

          if (appts.length > 0) {
            const list = appts.map((a, i) =>
              `${i + 1}. ${a.type} — ${a.date} at ${a.time} with ${a.therapist}`
            ).join("\n");
            conversations[from] = conversations[from] || [];
            conversations[from] = conversations[from].filter(m => !m.appointmentList);
            conversations[from].push({ appointmentList: appts.map(a => a._id.toString()) });
            await sendMessage(from,
              `Which appointment do you want to cancel?\n\n${list}\n\nReply with:\nCANCEL 1\nCANCEL 2\netc.`
            );
          } else {
            await sendMessage(from, "You have no upcoming appointments to cancel.");
          }
        }
      } else {
        await sendMessage(from, "I could not find your records. Please call us at +91-XXXXXXXXXX.");
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

// ─── DOCTOR WHATSAPP NUMBER ──────────────────────────────────────────
// Change this to doctor's actual WhatsApp number with country code
const DOCTOR_PHONE = process.env.DOCTOR_PHONE || "919711311785";

// ─── SEND DAILY SCHEDULE TO DOCTOR ───────────────────────────────────
const sendScheduleHandler = async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];
    const todayAppts = await Appointment.find({
      date: today,
      status: "confirmed"
    }).sort({ time: 1 });

    if (todayAppts.length === 0) {
      await sendMessage(DOCTOR_PHONE,
        `🗓 Today's Schedule — ${today}\n\nNo appointments today. Rest day! 😊\n\n— PhysioDesk`
      );
    } else {
      const lines = todayAppts.map((a, i) =>
        `${i + 1}. ${a.patientName}\n   📋 ${a.type}\n   👨‍⚕️ ${a.therapist}\n   🕐 ${a.time}\n   💰 ${a.payStatus === "paid" ? "Paid ✅" : a.payStatus === "clinic" ? "Pay at clinic 🏥" : "Pending ⚠️"}\n   💵 Rs.${a.amount}`
      ).join("\n\n");

      await sendMessage(DOCTOR_PHONE,
        `🗓 Today's Schedule — ${today}\n\nTotal patients: ${todayAppts.length}\n\n${lines}\n\n— PhysioDesk`
      );
    }

    res.json({ success: true, message: "Schedule sent to doctor on WhatsApp!" });
  } catch (err) {
    console.error("Send schedule error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

// Both GET and POST work
app.get("/api/send-schedule", sendScheduleHandler);
app.post("/api/send-schedule", sendScheduleHandler);

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
