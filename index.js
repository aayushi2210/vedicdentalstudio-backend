// PhysioClinic WhatsApp Bot — Complete Backend
// Env vars: WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, VERIFY_TOKEN, GROQ_API_KEY, MONGODB_URI, DOCTOR_PHONE

const express  = require("express");
const axios    = require("axios");
const mongoose = require("mongoose");

const app = express();
app.use(express.json());

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
  dob:       String,
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

const feedbackSchema = new mongoose.Schema({
  patientId:     { type: mongoose.Schema.Types.ObjectId, ref: "Patient" },
  patientName:   String,
  patientPhone:  String,
  appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Appointment" },
  therapist:     String,
  rating:        { type: Number, min: 1, max: 5 },
  comment:       String,
  createdAt:     { type: Date, default: Date.now }
});

const Patient     = mongoose.model("Patient",     patientSchema);
const Appointment = mongoose.model("Appointment", appointmentSchema);
const Package     = mongoose.model("Package",     packageSchema);
const Session     = mongoose.model("Session",     sessionSchema);
const Feedback    = mongoose.model("Feedback",    feedbackSchema);

const conversations = {};
const pendingFeedback = {}; // phone -> appointmentId waiting for feedback

// ─── SYSTEM PROMPT ───────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a receptionist chatbot for PhysioClinic, a physiotherapy clinic in Noida, India.

CLINIC DETAILS:
- Hours: Monday to Saturday, 8:00 AM to 6:00 PM. Closed Sundays.
- Location: Noida

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

RULES:
- Be warm, friendly and concise
- If user writes in Hindi or Hinglish, reply in same language
- For booking: collect name, phone, preferred date, time, type step by step
- Keep replies under 150 words
- No markdown symbols`;

// ─── SEND MESSAGE ────────────────────────────────────────────────────
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

// ─── AI REPLY ────────────────────────────────────────────────────────
async function getAIReply(userPhone, userMessage, contextNote = "") {
  if (!conversations[userPhone]) conversations[userPhone] = [];
  const history = conversations[userPhone];
  history.push({ role: "user", content: userMessage });
  const recent = history.filter(m => m.role === "user" || m.role === "assistant").slice(-10);
  try {
    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.3-70b-versatile", max_tokens: 300, temperature: 0.7,
        messages: [{ role: "system", content: SYSTEM_PROMPT + contextNote }, ...recent]
      },
      { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" } }
    );
    const reply = response.data?.choices?.[0]?.message?.content || "Sorry, please call us.";
    history.push({ role: "assistant", content: reply });
    if (history.length > 20) history.splice(0, 2);
    return reply;
  } catch (err) {
    return "Sorry, I'm having a technical issue. Please call +91-XXXXXXXXXX.";
  }
}

// ─── WEBHOOK VERIFY ──────────────────────────────────────────────────
app.get("/webhook", (req, res) => {
  const { "hub.mode": mode, "hub.verify_token": token, "hub.challenge": challenge } = req.query;
  if (mode === "subscribe" && token === process.env.VERIFY_TOKEN) {
    console.log("✅ Webhook verified");
    res.status(200).send(challenge);
  } else res.sendStatus(403);
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
    const cleanPhone = from.replace(/\D/g, "");
    console.log(`📩 From ${from}: ${text}`);

    // ── FEEDBACK COLLECTION ────────────────────────────────────────
    if (pendingFeedback[from]) {
      const rating = parseInt(text.trim());
      if (rating >= 1 && rating <= 5) {
        const apptId = pendingFeedback[from].appointmentId;
        const appt = await Appointment.findById(apptId);
        const patient = await Patient.findOne({ phone: cleanPhone });
        await Feedback.create({
          patientId: patient?._id,
          patientName: patient?.name || "Unknown",
          patientPhone: cleanPhone,
          appointmentId: apptId,
          therapist: appt?.therapist,
          rating,
          comment: "",
        });
        delete pendingFeedback[from];
        await sendMessage(from, `Thank you for your feedback! ⭐`.repeat(rating).slice(0, rating * 2) + `\n\nYou rated us ${rating}/5. We appreciate it!\n\n— PhysioClinic`);
        return;
      }
    }

    let existingPatient = null;
    if (dbConnected) {
      existingPatient = await Patient.findOne({ phone: cleanPhone });

      // ── NEW PATIENT: 4-STEP REGISTRATION ──────────────────────────
      if (!existingPatient) {
        existingPatient = await Patient.create({
          name: `Patient ${cleanPhone.slice(-4)}`,
          phone: cleanPhone,
          notes: `First contact: "${text}"`,
        });
        await sendMessage(from, `Welcome to PhysioClinic! 🏥\n\nLet me set up your profile.\n\nStep 1/4 — Please share your full name:`);
        conversations[from] = conversations[from] || [];
        conversations[from].push({ role: "system", content: "WAITING_FOR_NAME" });
        return;
      }

      // ── REGISTRATION STEPS ────────────────────────────────────────
      const history = conversations[from] || [];

      if (history.some(m => m.content === "WAITING_FOR_NAME")) {
        await Patient.findByIdAndUpdate(existingPatient._id, { name: text.trim() });
        existingPatient.name = text.trim();
        conversations[from] = history.filter(m => m.content !== "WAITING_FOR_NAME");
        conversations[from].push({ role: "system", content: "WAITING_FOR_ADDRESS" });
        await sendMessage(from, `Nice to meet you, ${text.trim()}! 😊\n\nStep 2/4 — Please share your address (area & city):`);
        return;
      }

      if (history.some(m => m.content === "WAITING_FOR_ADDRESS")) {
        await Patient.findByIdAndUpdate(existingPatient._id, { address: text.trim() });
        conversations[from] = history.filter(m => m.content !== "WAITING_FOR_ADDRESS");
        conversations[from].push({ role: "system", content: "WAITING_FOR_EMAIL" });
        await sendMessage(from, `Got it! 📍\n\nStep 3/4 — Please share your email:\n(Type SKIP to continue)`);
        return;
      }

      if (history.some(m => m.content === "WAITING_FOR_EMAIL")) {
        if (lower !== "skip") await Patient.findByIdAndUpdate(existingPatient._id, { email: text.trim() });
        conversations[from] = history.filter(m => m.content !== "WAITING_FOR_EMAIL");
        conversations[from].push({ role: "system", content: "WAITING_FOR_ISSUE" });
        await sendMessage(from, `Step 4/4 — What health issue are you coming in for?\n\n(e.g. Back pain, Knee pain, Sports injury)`);
        return;
      }

      if (history.some(m => m.content === "WAITING_FOR_ISSUE")) {
        await Patient.findByIdAndUpdate(existingPatient._id, { condition: text.trim() });
        existingPatient.condition = text.trim();
        conversations[from] = history.filter(m => m.content !== "WAITING_FOR_ISSUE");
        await sendMessage(from, `Profile complete! ✅\n\nWelcome, ${existingPatient.name}! 🏥\n\nHow can I help?\n\n1. Book appointment\n2. My appointments\n3. Pricing & timings\n4. Talk to reception\n\nJust type your question!`);
        return;
      }
    }

    // ── APPOINTMENT BOOKING AI ─────────────────────────────────────
    if (dbConnected && existingPatient) {
      const bookingWords = ["book","appointment","schedule","fix","slot","visit","tomorrow","today","morning","afternoon","evening","am","pm","baje","kal","aaj"];
      if (bookingWords.some(k => lower.includes(k))) {
        try {
          const convHistory = (conversations[from] || []).filter(m => m.role && m.content && !m.appointmentList).slice(-10).map(m => `${m.role === "user" ? "Patient" : "Bot"}: ${m.content}`).join("\n");
          const extractRes = await axios.post(
            "https://api.groq.com/openai/v1/chat/completions",
            {
              model: "llama-3.3-70b-versatile", max_tokens: 200, temperature: 0,
              messages: [{
                role: "system",
                content: `Extract appointment details. Today: ${new Date().toISOString().split("T")[0]}. Tomorrow: ${new Date(Date.now()+86400000).toISOString().split("T")[0]}.
Return ONLY JSON: {"hasAppointment":bool,"date":"YYYY-MM-DD or null","time":"HH:MM or null","therapist":"Dr. Rao/Dr. Mehra/Dr. Singh or null","type":"appointment type or null","payMode":"online/clinic or null"}
hasAppointment=true only if BOTH date AND time found.`
              }, { role: "user", content: `${convHistory}\nPatient: ${text}` }]
            },
            { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" } }
          );
          const extracted = JSON.parse(extractRes.data?.choices?.[0]?.message?.content || "{}");
          if (extracted.hasAppointment && extracted.date && extracted.time) {
            const priceMap = {"Initial Assessment":1800,"Follow-up":1200,"Walk-in":900,"Review":1000,"Physiotherapy Session":1500};
            const apptType = extracted.type || "Initial Assessment";
            const existing = await Appointment.findOne({ patientPhone: cleanPhone, date: extracted.date, time: extracted.time, status: "confirmed" });
            if (!existing) {
              await Appointment.create({
                patientId: existingPatient._id, patientName: existingPatient.name, patientPhone: cleanPhone,
                therapist: extracted.therapist || "Dr. Rao", date: extracted.date, time: extracted.time,
                type: apptType, status: "confirmed",
                payStatus: extracted.payMode === "clinic" ? "clinic" : "pending",
                amount: priceMap[apptType] || 1200
              });
            }
          }
        } catch (e) { console.log("Extraction error:", e.message); }
      }
    }

    // ── QUICK COMMANDS ─────────────────────────────────────────────
    if (["hi","hello","start","hey"].includes(lower)) {
      await sendMessage(from, existingPatient
        ? `Welcome back, ${existingPatient.name}! 😊\n\n1. Book appointment\n2. My appointments\n3. Cancel/reschedule\n4. Pricing\n5. Talk to reception`
        : `Welcome to PhysioClinic!\n\n1. Book appointment\n2. Check pricing\n3. Talk to reception`);
      return;
    }

    if (["my appointments","appointments","bookings"].includes(lower) && existingPatient) {
      const appts = await Appointment.find({ patientPhone: cleanPhone, status: "confirmed" }).sort({ date: 1 }).limit(5);
      if (appts.length > 0) {
        const list = appts.map((a,i) => `${i+1}. ${a.type}\n   👨‍⚕️ ${a.therapist}\n   📅 ${a.date} at ${a.time}\n   💰 ${a.payStatus === "paid" ? "Paid ✅" : a.payStatus === "clinic" ? "Pay at clinic 🏥" : "Pending ⚠️"}`).join("\n\n");
        await sendMessage(from, `📋 Your Appointments\n\n${list}\n\nType CANCEL [number] to cancel.`);
        conversations[from] = (conversations[from] || []).filter(m => !m.appointmentList);
        conversations[from].push({ appointmentList: appts.map(a => a._id.toString()) });
      } else {
        await sendMessage(from, `You have no upcoming appointments.\n\nType BOOK to schedule one!`);
      }
      return;
    }

    if (lower.startsWith("cancel") && existingPatient) {
      const numMatch = text.match(/cancel\s+(\d+)/i);
      if (numMatch) {
        const idx = parseInt(numMatch[1]) - 1;
        const apptListEntry = (conversations[from] || []).find(m => m.appointmentList);
        if (apptListEntry?.appointmentList[idx]) {
          const appt = await Appointment.findById(apptListEntry.appointmentList[idx]);
          if (appt?.status === "confirmed") {
            await Appointment.findByIdAndUpdate(appt._id, { status: "cancelled" });
            await sendMessage(from, `✅ Cancelled: ${appt.type} on ${appt.date} at ${appt.time}`);
          }
        }
      }
      return;
    }

    if (["human","receptionist"].includes(lower)) {
      await sendMessage(from, `Connecting you to our team.\n\nCall: +91-XXXXXXXXXX\nMon-Sat, 8 AM to 6 PM`);
      return;
    }

    // ── AI FALLBACK ───────────────────────────────────────────────
    let contextNote = "";
    if (existingPatient) {
      const recentAppts = await Appointment.find({ patientPhone: cleanPhone }).sort({ createdAt: -1 }).limit(3);
      if (recentAppts.length > 0)
        contextNote = `\n\nPatient: ${existingPatient.name}. Recent appointments: ${recentAppts.map(a => `${a.type} on ${a.date}`).join(", ")}`;
    }
    const reply = await getAIReply(from, text, contextNote);
    await sendMessage(from, reply);

  } catch (err) { console.error("Webhook error:", err.message); }
});

// ─── SEND DAILY SCHEDULE ─────────────────────────────────────────────
const DOCTOR_PHONE = process.env.DOCTOR_PHONE || "919711311785";
const sendScheduleHandler = async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];
    const todayAppts = await Appointment.find({ date: today, status: "confirmed" }).sort({ time: 1 });
    if (todayAppts.length === 0) {
      await sendMessage(DOCTOR_PHONE, `🗓 Schedule — ${today}\n\nNo appointments today.\n\n— PhysioDesk`);
    } else {
      const lines = todayAppts.map((a,i) => `${i+1}. ${a.patientName}\n   📋 ${a.type} · ${a.therapist}\n   🕐 ${a.time}\n   💵 ₹${a.amount} · ${a.payStatus}`).join("\n\n");
      await sendMessage(DOCTOR_PHONE, `🗓 Schedule — ${today}\n\n${todayAppts.length} patients\n\n${lines}\n\n— PhysioDesk`);
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};
app.get("/api/send-schedule", sendScheduleHandler);
app.post("/api/send-schedule", sendScheduleHandler);

// ─── PATIENTS ─────────────────────────────────────────────────────────
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
    if (!p) return res.status(404).json({ error: "Not found" });
    res.json(p);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── APPOINTMENTS ─────────────────────────────────────────────────────
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
    if (!a) return res.status(404).json({ error: "Not found" });
    res.json(a);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── PACKAGES ─────────────────────────────────────────────────────────
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

// ─── MARK SESSION ─────────────────────────────────────────────────────
app.post("/api/packages/:id/mark-session", async (req, res) => {
  try {
    const pkg = await Package.findById(req.params.id);
    if (!pkg) return res.status(404).json({ error: "Package not found" });
    const newDone = pkg.done + 1;
    const remaining = pkg.total - newDone;
    const updated = await Package.findByIdAndUpdate(req.params.id, { done: newDone, active: remaining > 0 }, { new: true });
    const patient = pkg.patientId ? await Patient.findById(pkg.patientId) : await Patient.findOne({ phone: pkg.patientPhone });
    if (patient?.phone) {
      const toPhone = patient.phone.startsWith("91") ? patient.phone : `91${patient.phone.replace(/\D/g,"")}`;
      await sendMessage(toPhone, `✅ Session Completed!\n\nPackage: ${pkg.name}\nDone: ${newDone}/${pkg.total}\nRemaining: ${remaining} session${remaining!==1?"s":""}\n\nSee you next time! 😊\n— PhysioClinic`);
      if (remaining <= 2 && remaining > 0) await sendMessage(toPhone, `⚠️ Package almost done!\n\nOnly ${remaining} session${remaining!==1?"s":""} of "${pkg.name}" left.\n\nContact us to renew.\n📞 +91-XXXXXXXXXX\n\n— PhysioClinic`);
      if (remaining === 0) await sendMessage(toPhone, `🎉 Package Complete!\n\nAll ${pkg.total} sessions of "${pkg.name}" done! 💪\n— PhysioClinic`);
    }
    res.json({ updated, remaining });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── SESSIONS ─────────────────────────────────────────────────────────
app.get("/api/sessions", async (req, res) => {
  try { res.json(await Session.find().sort({ createdAt: -1 })); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
app.get("/api/sessions/:packageId", async (req, res) => {
  try { res.json(await Session.find({ packageId: req.params.packageId }).sort({ no: 1 })); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
app.post("/api/sessions", async (req, res) => {
  try { const s = new Session(req.body); await s.save(); res.json(s); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── FEEDBACK ─────────────────────────────────────────────────────────
app.get("/api/feedback", async (req, res) => {
  try { res.json(await Feedback.find().sort({ createdAt: -1 })); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
app.post("/api/feedback", async (req, res) => {
  try { const f = new Feedback(req.body); await f.save(); res.json(f); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
app.post("/api/send-feedback/:appointmentId", async (req, res) => {
  try {
    const appt = await Appointment.findById(req.params.appointmentId);
    if (!appt) return res.status(404).json({ error: "Appointment not found" });
    const toPhone = appt.patientPhone.startsWith("91") ? appt.patientPhone : `91${appt.patientPhone.replace(/\D/g,"")}`;
    pendingFeedback[`${toPhone}`] = { appointmentId: req.params.appointmentId };
    await sendMessage(toPhone,
      `Hi ${appt.patientName}! 👋\n\nThank you for visiting PhysioClinic.\n\nHow was your experience with ${appt.therapist}?\n\nPlease reply with a number:\n⭐ 1 — Poor\n⭐⭐ 2 — Fair\n⭐⭐⭐ 3 — Good\n⭐⭐⭐⭐ 4 — Very Good\n⭐⭐⭐⭐⭐ 5 — Excellent\n\n— PhysioClinic`
    );
    res.json({ success: true, message: "Feedback request sent" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── HEALTH CHECK ─────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ status: "running", message: "PhysioClinic Bot", database: mongoose.connection.readyState === 1 ? "connected" : "disconnected" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Bot running on port ${PORT}`));
