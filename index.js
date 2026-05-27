// PhysioClinic WhatsApp Chatbot
// Groq AI + MongoDB — data permanently saved
// Env vars: WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, VERIFY_TOKEN, GROQ_API_KEY, MONGODB_URI

const express  = require("express");
const axios    = require("axios");
const mongoose = require("mongoose");

const app = express();
app.use(express.json());

// ─── CORS ────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// ─── MONGODB ─────────────────────────────────────────────────────────
let dbConnected = false;
if (process.env.MONGODB_URI) {
  mongoose.connect(process.env.MONGODB_URI)
    .then(() => { dbConnected = true; console.log("✅ MongoDB connected"); })
    .catch(err => console.error("⚠️ MongoDB error:", err.message));
} else {
  console.log("⚠️ No MONGODB_URI — running without database");
}

// ─── SCHEMAS ─────────────────────────────────────────────────────────
const patientSchema = new mongoose.Schema({
  name:      { type: String, required: true },
  phone:     { type: String, required: true, unique: true },
  condition: String,
  address:   String,
  email:     String,
  notes:     String,
  treatment: String,
  createdAt: { type: Date, default: Date.now }
});

const appointmentSchema = new mongoose.Schema({
  patientId:   { type: mongoose.Schema.Types.ObjectId, ref: "Patient" },
  patientName: String,
  patientPhone:String,
  therapist:   String,
  date:        String,
  time:        String,
  type:        String,
  status:      { type: String, default: "confirmed" },
  payStatus:   { type: String, default: "pending" },
  amount:      Number,
  createdAt:   { type: Date, default: Date.now }
});

const packageSchema = new mongoose.Schema({
  patientId:   { type: mongoose.Schema.Types.ObjectId, ref: "Patient" },
  patientName: String,
  patientPhone:String,
  name:        { type: String, required: true },
  total:       { type: Number, required: true },
  done:        { type: Number, default: 0 },
  amount:      Number,
  payStatus:   { type: String, default: "pending" },
  therapist:   String,
  startDate:   String,
  active:      { type: Boolean, default: true },
  createdAt:   { type: Date, default: Date.now }
});

const sessionSchema = new mongoose.Schema({
  packageId:   { type: mongoose.Schema.Types.ObjectId, ref: "Package" },
  patientId:   { type: mongoose.Schema.Types.ObjectId, ref: "Patient" },
  patientName: String,
  no:          Number,
  date:        String,
  time:        String,
  therapist:   String,
  treatments:  [String],
  notes:       String,
  createdAt:   { type: Date, default: Date.now }
});

const Patient     = mongoose.model("Patient",     patientSchema);
const Appointment = mongoose.model("Appointment", appointmentSchema);
const Package     = mongoose.model("Package",     packageSchema);
const Session     = mongoose.model("Session",     sessionSchema);

const conversations = {};

// ─── SYSTEM PROMPT ───────────────────────────────────────────────────
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
      { messaging_product: "whatsapp", to, type: "text", text: { body: text } },
      { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" } }
    );
    console.log(`✅ Sent to ${to}`);
  } catch (err) {
    console.error("Send error:", err.response?.data || err.message);
  }
}

// ─── GROQ AI REPLY ───────────────────────────────────────────────────
async function getAIReply(userPhone, userMessage, contextNote = "") {
  if (!conversations[userPhone]) conversations[userPhone] = [];
  const history = conversations[userPhone];
  history.push({ role: "user", content: userMessage });
  const recentHistory = history
    .filter(m => m.role === "user" || m.role === "assistant")
    .filter(m => m.content && typeof m.content === "string")
    .slice(-10);
  try {
    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.3-70b-versatile",
        max_tokens: 300,
        temperature: 0.7,
        messages: [{ role: "system", content: SYSTEM_PROMPT + contextNote }, ...recentHistory]
      },
      { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" } }
    );
    const reply = response.data?.choices?.[0]?.message?.content || "Sorry, please call us at +91-XXXXXXXXXX.";
    history.push({ role: "assistant", content: reply });
    if (history.length > 20) history.splice(0, 2);
    return reply;
  } catch (err) {
    console.error("Groq error:", err.response?.data || err.message);
    return "Sorry, I am having a technical issue. Please call +91-XXXXXXXXXX.";
  }
}

// ─── WEBHOOK VERIFY ──────────────────────────────────────────────────
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"], token = req.query["hub.verify_token"], challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === process.env.VERIFY_TOKEN) { console.log("✅ Webhook verified"); res.status(200).send(challenge); }
  else res.sendStatus(403);
});

// ─── INCOMING MESSAGES ───────────────────────────────────────────────
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  try {
    const body = req.body;
    if (body.object !== "whatsapp_business_account") return;
    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!message || message.type !== "text") return;

    const from  = message.from;
    const text  = message.text.body.trim();
    const lower = text.toLowerCase();
    console.log(`📩 From ${from}: ${text}`);

    const cleanPhone = from.replace(/\D/g, "");
    let existingPatient = null;

    if (dbConnected) {
      existingPatient = await Patient.findOne({ phone: cleanPhone });

      // ── NEW PATIENT: start 4-step registration ────────────────
      if (!existingPatient) {
        existingPatient = await Patient.create({
          name: `Patient ${cleanPhone.slice(-4)}`,
          phone: cleanPhone,
          notes: `First message: "${text}"`,
        });
        console.log(`✅ New patient created: ${cleanPhone}`);
        await sendMessage(from,
          `Welcome to PhysioClinic! 🏥\n\nI'm your virtual receptionist. Let me set up your profile quickly.\n\nStep 1/4 — Please tell me your full name:`
        );
        conversations[from] = conversations[from] || [];
        conversations[from].push({ role: "system", content: "WAITING_FOR_NAME" });
        return;
      }

      // ── REGISTRATION STEPS ────────────────────────────────────
      const history = conversations[from] || [];

      // Step 1 — Name
      if (history.some(m => m.content === "WAITING_FOR_NAME")) {
        const patientName = text.trim();
        await Patient.findByIdAndUpdate(existingPatient._id, { name: patientName });
        existingPatient.name = patientName;
        conversations[from] = history.filter(m => m.content !== "WAITING_FOR_NAME");
        conversations[from].push({ role: "system", content: "WAITING_FOR_ADDRESS" });
        console.log(`✅ Name saved: ${patientName}`);
        await sendMessage(from,
          `Nice to meet you, ${patientName}! 😊\n\nStep 2/4 — Please share your home address:\n(Area and city, e.g. Saket, South Delhi)`
        );
        return;
      }

      // Step 2 — Address
      if (history.some(m => m.content === "WAITING_FOR_ADDRESS")) {
        const address = text.trim();
        await Patient.findByIdAndUpdate(existingPatient._id, { address });
        conversations[from] = history.filter(m => m.content !== "WAITING_FOR_ADDRESS");
        conversations[from].push({ role: "system", content: "WAITING_FOR_EMAIL" });
        console.log(`✅ Address saved: ${address}`);
        await sendMessage(from,
          `Got it! 📍\n\nStep 3/4 — Please share your email ID:\n(Type SKIP if you prefer not to)`
        );
        return;
      }

      // Step 3 — Email
      if (history.some(m => m.content === "WAITING_FOR_EMAIL")) {
        const email = lower === "skip" ? "" : text.trim();
        if (email) await Patient.findByIdAndUpdate(existingPatient._id, { email });
        conversations[from] = history.filter(m => m.content !== "WAITING_FOR_EMAIL");
        conversations[from].push({ role: "system", content: "WAITING_FOR_ISSUE" });
        console.log(`✅ Email saved: ${email || "skipped"}`);
        await sendMessage(from,
          `${email ? "Thank you! 📧" : "No problem!"}\n\nStep 4/4 — What health issue are you coming in for?\n\nExamples:\n• Back or neck pain\n• Knee or shoulder pain\n• Sports injury\n• Post-surgery rehab\n• Any other condition`
        );
        return;
      }

      // Step 4 — Condition/Issue
      if (history.some(m => m.content === "WAITING_FOR_ISSUE")) {
        const condition = text.trim();
        await Patient.findByIdAndUpdate(existingPatient._id, { condition });
        existingPatient.condition = condition;
        conversations[from] = history.filter(m => m.content !== "WAITING_FOR_ISSUE");
        console.log(`✅ Condition saved: ${condition}`);
        await sendMessage(from,
          `Profile complete! ✅\n\nWelcome to PhysioClinic, ${existingPatient.name}! 🏥\n\nHow can I help you today?\n\n1. Book an appointment\n2. Check pricing and timings\n3. View my appointments\n4. Talk to a human receptionist\n\nJust type your question!`
        );
        return;
      }
    }

    // ── AI APPOINTMENT EXTRACTION ─────────────────────────────────
    if (dbConnected && existingPatient) {
      const bookingWords = ["book","appointment","schedule","confirm","fix","slot","visit","tomorrow","today","morning","afternoon","evening","am","pm","baje","kal","aaj"];
      if (bookingWords.some(k => lower.includes(k))) {
        try {
          const convHistory = (conversations[from] || [])
            .filter(m => m.role && m.content && !m.appointmentList)
            .slice(-10)
            .map(m => `${m.role === "user" ? "Patient" : "Bot"}: ${m.content}`)
            .join("\n");
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
- hasAppointment = true only if BOTH date AND time are found
Return ONLY the JSON, no other text.`
                },
                { role: "user", content: `${convHistory}\nPatient: ${text}` }
              ]
            },
            { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" } }
          );
          const extractedText = extractRes.data?.choices?.[0]?.message?.content || "{}";
          const extracted = JSON.parse(extractedText.replace(/```json|```/g, "").trim());
          console.log("Extracted:", JSON.stringify(extracted));
          if (extracted.hasAppointment && extracted.date && extracted.time) {
            const priceMap = { "Initial Assessment":1800, "Follow-up":1200, "Walk-in":900, "Review":1000, "Physiotherapy Session":1500 };
            const apptType = extracted.type || "Initial Assessment";
            const bookingForEntry = (conversations[from]||[]).find(m => m.content?.startsWith("BOOKING_FOR:"));
            let apptPatientId = existingPatient?._id, apptPatientName = existingPatient?.name, apptPatientPhone = cleanPhone;
            if (bookingForEntry) {
              const parts = bookingForEntry.content.split(":");
              apptPatientId = parts[1]; apptPatientName = parts[2];
              const otherPatient = await Patient.findById(apptPatientId);
              apptPatientPhone = otherPatient?.phone || cleanPhone;
              conversations[from] = (conversations[from]||[]).filter(m => !m.content?.startsWith("BOOKING_FOR:"));
            }
            const existing = await Appointment.findOne({ patientPhone: apptPatientPhone, date: extracted.date, time: extracted.time, status: "confirmed" });
            if (!existing) {
              await Appointment.create({
                patientId: apptPatientId, patientName: apptPatientName, patientPhone: apptPatientPhone,
                therapist: extracted.therapist || "Dr. Rao", date: extracted.date, time: extracted.time,
                type: apptType, status: "confirmed",
                payStatus: extracted.payMode === "clinic" ? "clinic" : "pending",
                amount: priceMap[apptType] || 1200
              });
              console.log(`✅ Appointment saved: ${apptPatientName} — ${extracted.date} at ${extracted.time}`);
            }
          }
        } catch (e) { console.log("Extraction error:", e.message); }
      }
    }

    // ── SPECIAL COMMANDS ──────────────────────────────────────────
    if (["hi","hello","start","hey"].includes(lower)) {
      await sendMessage(from, existingPatient
        ? `Welcome back, ${existingPatient.name}! 😊\n\nHow can I help you today?\n\n1. Book appointment\n2. My appointments\n3. Cancel or reschedule\n4. Pricing and timings\n5. Talk to a human\n\nJust type your question!`
        : `Welcome to PhysioClinic!\n\nI am your virtual receptionist. I can help you:\n\n1. Book an appointment\n2. Check pricing and timings\n3. Talk to a human receptionist\n\nJust type your question!`
      );
      return;
    }

    if (lower === "address") {
      await sendMessage(from, "PhysioClinic\n\n123 Wellness Lane\nSouth Delhi - 110017\n\nNear XYZ Metro Station, Gate 2\n\nOpen Mon-Sat, 8 AM to 6 PM");
      return;
    }

    // ── BOOK FOR SOMEONE ELSE ─────────────────────────────────────
    const forSomeoneElse = ["for my","for sister","for brother","for wife","for husband","for mother","for father","for friend","for daughter","for son","mere liye nahi","unke liye","apni sister","apni wife","apne bhai","apni maa","apne papa"];
    if (forSomeoneElse.some(k => lower.includes(k)) && dbConnected) {
      const h = conversations[from] || [];
      if (!h.some(m => m.content === "WAITING_FOR_OTHER_NAME") && !h.some(m => m.content === "WAITING_FOR_OTHER_PHONE")) {
        conversations[from] = h.filter(m => m.content !== "WAITING_FOR_OTHER_NAME" && m.content !== "WAITING_FOR_OTHER_PHONE");
        conversations[from].push({ role: "system", content: "WAITING_FOR_OTHER_NAME" });
        await sendMessage(from, `Sure! I can book for your family member.\n\nPlease share their full name:`);
        return;
      }
    }

    if (dbConnected) {
      const h = conversations[from] || [];
      if (h.some(m => m.content === "WAITING_FOR_OTHER_NAME")) {
        const otherName = text.trim();
        conversations[from] = h.filter(m => m.content !== "WAITING_FOR_OTHER_NAME");
        conversations[from].push({ role: "system", content: `OTHER_NAME:${otherName}` });
        conversations[from].push({ role: "system", content: "WAITING_FOR_OTHER_PHONE" });
        await sendMessage(from, `Got it! And what is ${otherName}'s phone number?\n\n(10-digit number, or type SKIP to use yours)`);
        return;
      }
      if (h.some(m => m.content === "WAITING_FOR_OTHER_PHONE")) {
        const otherNameEntry = h.find(m => m.content?.startsWith("OTHER_NAME:"));
        const otherName = otherNameEntry?.content?.replace("OTHER_NAME:","") || "Family Member";
        const otherPhone = lower === "skip" ? cleanPhone : text.replace(/\D/g,"");
        conversations[from] = h.filter(m => m.content !== "WAITING_FOR_OTHER_PHONE" && !m.content?.startsWith("OTHER_NAME:"));
        let otherPatient = await Patient.findOne({ phone: otherPhone });
        if (!otherPatient) {
          otherPatient = await Patient.create({ name: otherName, phone: otherPhone, notes: `Added by ${existingPatient?.name || cleanPhone}` });
        } else if (otherPatient.name.startsWith("Patient ")) {
          await Patient.findByIdAndUpdate(otherPatient._id, { name: otherName });
        }
        conversations[from].push({ role: "system", content: `BOOKING_FOR:${otherPatient._id}:${otherName}` });
        await sendMessage(from, `Perfect! Now share appointment details for ${otherName}:\n\nExample: Tomorrow at 10am with Dr. Rao for Initial Assessment`);
        return;
      }
    }

    // ── MY APPOINTMENTS ───────────────────────────────────────────
    if (["my appointments","appointments","my bookings"].includes(lower)) {
      if (existingPatient) {
        const appts = await Appointment.find({ patientPhone: cleanPhone, status: "confirmed" }).sort({ date: 1 }).limit(5);
        if (appts.length > 0) {
          const list = appts.map((a,i) => `${i+1}. ${a.type}\n   👨‍⚕️ ${a.therapist}\n   📅 ${a.date} at ${a.time}\n   💰 ${a.payStatus==="paid"?"Paid ✅":a.payStatus==="clinic"?"Pay at clinic 🏥":"Pending ⚠️"}`).join("\n\n");
          await sendMessage(from, `📋 Your Upcoming Appointments\n\n${list}\n\nTo cancel, reply:\nCANCEL 1 (for appointment 1)\nCANCEL 2 (for appointment 2)`);
          conversations[from] = (conversations[from]||[]).filter(m => !m.appointmentList);
          conversations[from].push({ appointmentList: appts.map(a => a._id.toString()) });
        } else {
          await sendMessage(from, `You have no upcoming appointments.\n\nType BOOK to schedule one! 📅`);
        }
      }
      return;
    }

    // ── CANCEL ────────────────────────────────────────────────────
    if (lower.startsWith("cancel")) {
      if (existingPatient) {
        const numMatch = text.match(/cancel\s+(\d+)/i);
        if (numMatch) {
          const idx = parseInt(numMatch[1]) - 1;
          const apptListEntry = (conversations[from]||[]).find(m => m.appointmentList);
          if (apptListEntry?.appointmentList[idx]) {
            const appt = await Appointment.findById(apptListEntry.appointmentList[idx]);
            if (appt?.status === "confirmed") {
              await Appointment.findByIdAndUpdate(appt._id, { status: "cancelled" });
              await sendMessage(from, `✅ Appointment Cancelled\n\n${appt.type}\n${appt.therapist}\n${appt.date} at ${appt.time}\n\nTo book again, type BOOK. 📅`);
            } else { await sendMessage(from, "This appointment is already cancelled or not found."); }
          }
        } else {
          const appts = await Appointment.find({ patientPhone: cleanPhone, status: "confirmed" }).sort({ date: 1 }).limit(5);
          if (appts.length > 0) {
            const list = appts.map((a,i) => `${i+1}. ${a.type} — ${a.date} at ${a.time} with ${a.therapist}`).join("\n");
            conversations[from] = (conversations[from]||[]).filter(m => !m.appointmentList);
            conversations[from].push({ appointmentList: appts.map(a => a._id.toString()) });
            await sendMessage(from, `Which appointment to cancel?\n\n${list}\n\nReply: CANCEL 1, CANCEL 2 etc.`);
          } else { await sendMessage(from, "You have no upcoming appointments to cancel."); }
        }
      }
      return;
    }

    if (["human","receptionist","speak to someone"].includes(lower)) {
      await sendMessage(from, "Connecting you to our team.\n\nCall us:\n+91-XXXXXXXXXX\n\nMon-Sat, 8 AM to 6 PM");
      return;
    }

    // ── AI FALLBACK ───────────────────────────────────────────────
    let contextNote = "";
    if (existingPatient) {
      const recentAppts = await Appointment.find({ patientPhone: cleanPhone }).sort({ createdAt: -1 }).limit(3);
      if (recentAppts.length > 0)
        contextNote = `\n\nPatient context: This is ${existingPatient.name}. Recent appointments: ` + recentAppts.map(a => `${a.type} on ${a.date}`).join(", ");
    }
    const reply = await getAIReply(from, text, contextNote);
    await sendMessage(from, reply);

  } catch (err) { console.error("Webhook error:", err.message); }
});

// ─── DOCTOR PHONE ─────────────────────────────────────────────────────
const DOCTOR_PHONE = process.env.DOCTOR_PHONE || "919711311785";

// ─── SEND DAILY SCHEDULE ─────────────────────────────────────────────
const sendScheduleHandler = async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];
    const todayAppts = await Appointment.find({ date: today, status: "confirmed" }).sort({ time: 1 });
    if (todayAppts.length === 0) {
      await sendMessage(DOCTOR_PHONE, `🗓 Today's Schedule — ${today}\n\nNo appointments today. Rest day! 😊\n\n— PhysioDesk`);
    } else {
      const lines = todayAppts.map((a,i) =>
        `${i+1}. ${a.patientName}\n   📋 ${a.type}\n   👨‍⚕️ ${a.therapist}\n   🕐 ${a.time}\n   💰 ${a.payStatus==="paid"?"Paid ✅":a.payStatus==="clinic"?"Pay at clinic 🏥":"Pending ⚠️"}\n   💵 Rs.${a.amount}`
      ).join("\n\n");
      await sendMessage(DOCTOR_PHONE, `🗓 Today's Schedule — ${today}\n\nTotal patients: ${todayAppts.length}\n\n${lines}\n\n— PhysioDesk`);
    }
    res.json({ success: true, message: "Schedule sent!" });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};
app.get("/api/send-schedule", sendScheduleHandler);
app.post("/api/send-schedule", sendScheduleHandler);

// ─── API ENDPOINTS ────────────────────────────────────────────────────

app.get("/api/patients", async (req, res) => {
  try { res.json(await Patient.find().sort({ createdAt: -1 })); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/patients", async (req, res) => {
  try { const p = new Patient(req.body); await p.save(); res.json(p); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.put("/api/patients/:id", async (req, res) => {
  try {
    const p = await Patient.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!p) return res.status(404).json({ error: "Patient not found" });
    res.json(p);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/appointments", async (req, res) => {
  try { res.json(await Appointment.find().sort({ createdAt: -1 })); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/appointments", async (req, res) => {
  try { const a = new Appointment(req.body); await a.save(); res.json(a); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.put("/api/appointments/:id", async (req, res) => {
  try {
    const a = await Appointment.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!a) return res.status(404).json({ error: "Appointment not found" });
    res.json(a);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/packages", async (req, res) => {
  try { res.json(await Package.find().sort({ createdAt: -1 })); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/packages/:patientId", async (req, res) => {
  try { res.json(await Package.find({ patientId: req.params.patientId }).sort({ createdAt: -1 })); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/packages", async (req, res) => {
  try { const p = new Package(req.body); await p.save(); res.json(p); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.put("/api/packages/:id", async (req, res) => {
  try { res.json(await Package.findByIdAndUpdate(req.params.id, req.body, { new: true })); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/sessions", async (req, res) => {
  try { res.json(await Session.find().sort({ createdAt: -1 })); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/sessions/:packageId", async (req, res) => {
  try { res.json(await Session.find({ packageId: req.params.packageId }).sort({ no: 1 })); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/sessions", async (req, res) => {
  try {
    const s = new Session(req.body); await s.save();
    await Package.findByIdAndUpdate(req.body.packageId, { $inc: { done: 1 } });
    res.json(s);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── HEALTH CHECK ─────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ status: "running", message: "PhysioClinic WhatsApp Bot", database: mongoose.connection.readyState === 1 ? "connected" : "disconnected" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Bot running on port ${PORT}`));
