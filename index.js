// ════════════════════════════════════════════════════════════════════
//  VEDIC DENTAL STUDIO
//  Single doctor · Hindi/English · Video consults · Slot conflict check
//  Reminders · Cancellation alerts · WhatsApp document upload (secured)
//  Manual pay-at-clinic + emailed invoice
//
//  ENV VARS (set on Render):
//   Required : WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, VERIFY_TOKEN, GROQ_API_KEY, MONGODB_URI
//   Doctor   : DOCTOR_PHONE (91XXXXXXXXXX), DOCTOR_NAME (e.g. "Dr. Sharma")
//   Reviews  : GOOGLE_REVIEW_LINK   (your Google review short link)
//   Documents: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
//   Invoice  : SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
//   Security : FRONTEND_ORIGIN  (your dashboard URL; locks CORS), CRON_SECRET
// ════════════════════════════════════════════════════════════════════

const express    = require("express");
const axios      = require("axios");
const mongoose   = require("mongoose");
const cloudinary = require("cloudinary").v2;
const nodemailer = require("nodemailer");

const app = express();
app.use(express.json({ limit: "2mb" }));

// ─── CORS (locked to your dashboard if FRONTEND_ORIGIN is set) ────────
const ALLOWED = process.env.FRONTEND_ORIGIN || "*";
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", ALLOWED);
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// ─── CLINIC CONFIG ───────────────────────────────────────────────────
const CLINIC       = "Vedic Dental Studio";
const DOCTOR_NAME  = process.env.DOCTOR_NAME || "Dr. Shailly Ujjwal";   // ← set the real name in env
const DOCTOR_PHONE = process.env.DOCTOR_PHONE || "919711311785";
const CONSULT_FEE  = 500;
const RECEPTION_PHONE = process.env.RECEPTION_PHONE || "+91-XXXXXXXXXX";   // ← set reception number in env
const REVIEW_LINK = process.env.GOOGLE_REVIEW_LINK || "";
const UPIID = process.env.UPIID || "yourname@upi";
// Clinic working hours — edit this list to match the studio's real slots.
const SLOTS = ["10:00","10:30","11:00","11:30","12:00","12:30","13:00","13:30",
               "16:00","16:30","17:00","17:30","18:00","18:30","19:00","19:30","20:00"];
const CLOSED_DAY = 0; // 0 = Sunday closed

// ─── MONGODB ─────────────────────────────────────────────────────────
let dbConnected = false;
if (process.env.MONGODB_URI) {
  mongoose.connect(process.env.MONGODB_URI)
    .then(() => { dbConnected = true; console.log("✅ MongoDB connected"); })
    .catch(err => console.error("⚠️ MongoDB error:", err.message));
} else {
  console.log("⚠️ No MONGODB_URI — running without database");
}

const { Patient, Appointment, Package, PackageTemplate, TreatmentPlan, Session, Invoice, Feedback, Document } = require("./models");

// ─── CLOUDINARY (documents) ──────────────────────────────────────────
const CLOUD_READY = !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
if (CLOUD_READY) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
  console.log("✅ Cloudinary ready");
} else {
  console.log("⚠️ Cloudinary not configured — WhatsApp document upload disabled");
}

// ─── EMAIL (invoices) ────────────────────────────────────────────────
const MAIL_READY = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
const mailer = MAIL_READY ? nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: parseInt(process.env.SMTP_PORT || "587") === 465,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
}) : null;
if (MAIL_READY) console.log("✅ SMTP ready"); else console.log("⚠️ SMTP not configured — invoice email disabled");

const conversations = {};

// ════════════════════════════════════════════════════════════════════
//  BILINGUAL STRINGS
// ════════════════════════════════════════════════════════════════════
const T = {
  langAsk: () =>
    `🦷 *${CLINIC}*\n\nNamaste! Apni bhasha choose karein / Choose your language:\n\n1️⃣ हिंदी\n2️⃣ English`,
  menu: (lang, name) => lang === "hi"
    ? `Namaste${name ? " " + name : ""}! 🙏\n\nMain aapki kaise madad karun?\n\n1. Appointment book karein\n2. Meri appointments\n3. Fees & timings\n4. Reception se baat karein\n\nbas type karke bataiye 😊`
    : `Hello${name ? " " + name : ""}! 👋\n\nHow can I help you today?\n\n1. Book an appointment\n2. My appointments\n3. Fees & timings\n4. Talk to reception\n\nJust type your request 😊`,
  profileAsk: (lang) => lang === "hi"
    ? `Appointment book karne se pehle aapki profile set karni hai. Kripya *ek hi message* mein bhejein:\n\n• Pura naam\n• Email\n• Address\n\nExample:\nRahul Verma, rahul@gmail.com, Sector 12 Dwarka Delhi`
    : `Before booking, let me set up your profile. Please send in *one message*:\n\n• Full name\n• Email\n• Address\n\nExample:\nRahul Verma, rahul@gmail.com, Sector 12 Dwarka Delhi`,
  profileNeedEmail: (lang) => lang === "hi"
    ? `Email sahi nahi mila. Kripya dobara bhejein: Naam, Email, Address`
    : `Couldn't read a valid email. Please resend: Name, Email, Address`,
  profileDone: (lang, name) => lang === "hi"
    ? `Dhanyavaad ${name}! ✅ Profile save ho gayi.\n\nAb apni preferred *date aur time* bataiye — aur clinic visit chahiye ya *video consultation*?`
    : `Thank you ${name}! ✅ Profile saved.\n\nNow tell me your preferred *date & time* — and do you want a clinic visit or a *video consultation*?`,
  slotTaken: (lang, time, alts) => lang === "hi"
    ? `Maaf kijiye, ${time} par doctor pehle se busy hain. 🙏\n\nIs din ke available slots:\n${alts}\n\nKoi ek time bataiye.`
    : `Sorry, ${DOCTOR_NAME} is already booked at ${time}. 🙏\n\nAvailable slots that day:\n${alts}\n\nPlease pick one.`,
  noSlots: (lang) => lang === "hi"
    ? `Us din koi slot khaali nahi hai. Kripya doosri date bataiye.`
    : `No slots are free that day. Please try another date.`,
  askReason: (lang) => lang === "hi"
    ? `Theek hai! 📋 Booking confirm karne se pehle — aap *kis problem* ke liye consultation lena chahte hain? (jaise: daant me dard, sujan, cleaning, checkup)\n\n💵 Consultation fee: ₹${CONSULT_FEE} (clinic par cash/UPI)`
    : `Great! 📋 Before I confirm — what is the consultation *for*? (e.g. tooth pain, swelling, cleaning, checkup)\n\n💵 Consultation fee: ₹${CONSULT_FEE} (pay at clinic, cash/UPI)`,
  askDate: (lang, time) => lang === "hi"
    ? `${time} ka time noted! 📅 Aap kis din aana chahenge? (jaise: kal, parso, ya 5 July)`
    : `Noted ${time}! 📅 Which day would you like to come in? (e.g. tomorrow, or 5 July)`,
  askTime: (lang, date) => lang === "hi"
    ? `${date} — theek hai! ⏰ Kis time aana chahenge? Slots: 10 AM se 7 PM (Mon–Sat).`
    : `${date} — got it! ⏰ What time works for you? Slots: 10 AM to 7 PM (Mon–Sat).`,
  booked: (lang, a) => {
    const when = `${a.date} ${a.time}`;
    const vid  = a.mode === "video" && a.videoLink
      ? (lang === "hi"
        ? `\n\n💳 *Step 1 — Payment (zaroori):*\nUPI par ₹${a.amount} bhejein 👉 ${UPIID}\nPhir payment ka *screenshot yahin bhej dein*.\n\n✅ Payment confirm hote hi consultation pakki.\n\n🎥 Video link (sirf payment ke baad valid):\n${a.videoLink}\n(Appointment time par tap karein)`
          : `\n\n💳 *Step 1 — Payment (required):*\nSend ₹${a.amount} via UPI 👉 ${UPIID}\nThen *share the payment screenshot here*.\n\n✅ Your consultation is confirmed once payment is received.\n\n🎥 Video link (valid only after payment):\n${a.videoLink}\n(Tap at your appointment time)`)
      : (lang === "hi" ? `\n\n📍 Clinic par aaiye. Payment clinic par hi.` : `\n\n📍 Please visit the clinic. Payment at clinic.`);
    return lang === "hi"
      ? `✅ Appointment confirm!\n\n👨‍⚕️ ${a.therapist}\n📅 ${when}\n🦷 ${a.type}\n💵 ₹${a.amount}${vid}\n\n— ${CLINIC}`
      : `✅ Appointment confirmed!\n\n👨‍⚕️ ${a.therapist}\n📅 ${when}\n🦷 ${a.type}\n💵 ₹${a.amount}${vid}\n\n— ${CLINIC}`;
  },
  fees: (lang) => lang === "hi"
    ? `🦷 *${CLINIC}*\n\nConsultation fee: ₹${CONSULT_FEE}\nDoctor: ${DOCTOR_NAME}\nTimings: Mon–Sat\nPayment: clinic par (cash/UPI)\n\nVideo consultation bhi available hai 🎥`
    : `🦷 *${CLINIC}*\n\nConsultation fee: ₹${CONSULT_FEE}\nDoctor: ${DOCTOR_NAME}\nTimings: Mon–Sat\nPayment: at the clinic (cash/UPI)\n\nVideo consultation also available 🎥`,
  docSaved: (lang) => lang === "hi"
    ? `📎 Aapka document mil gaya aur secure tareeke se aapki profile mein save ho gaya. Dhanyavaad!`
    : `📎 Got your document — securely saved to your profile. Thank you!`,
  reviewMsg: (lang, name) => lang === "hi"
    ? `Namaste ${name}! 🙏\n\n${CLINIC} mein aane ke liye dhanyavaad. Aapka anubhav kaisa raha? Neeche tap karke Google par review dein — humein bahut khushi hogi:\n\n${REVIEW_LINK}`
    : `Hi ${name}! 🙏\n\nThank you for visiting ${CLINIC}. How was your experience? Tap below to leave a quick Google review — it means a lot:\n\n${REVIEW_LINK}`,
  human: (lang) => lang === "hi"
    ? `Reception se baat karne ke liye humein call karein:\n📞 ${RECEPTION_PHONE}\n(Mon–Sat, 9 AM – 7 PM) — ${CLINIC}`
    : `Please call us on:\n📞 ${RECEPTION_PHONE}\n(Mon–Sat, 9 AM – 7 PM) — ${CLINIC}`,
};

// ════════════════════════════════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════════════════════════════════
const wa = p => { const c = String(p).replace(/\D/g, ""); return c.startsWith("91") ? c : `91${c.slice(-10)}`; };

// IST clock helpers (Render runs in UTC)
function istNow() { return new Date(Date.now() + 5.5 * 3600 * 1000); }
function istDate() { return istNow().toISOString().split("T")[0]; }
function minsUntil(date, time) {
  const apptMs = Date.parse(`${date}T${time}:00.000Z`);
  const nowMs  = Date.parse(istNow().toISOString().slice(0, 19) + ".000Z");
  return (apptMs - nowMs) / 60000;
}

async function sendMessage(to, text) {
  try {
    await axios.post(
      `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_ID}/messages`,
      { messaging_product: "whatsapp", to: wa(to), type: "text", text: { body: text } },
      { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" } }
    );
  } catch (err) { console.error("Send error:", err.response?.data || err.message); }
}

// Download a WhatsApp media file and push it to Cloudinary as AUTHENTICATED (not public)
async function storeWhatsappMedia(mediaId, kindHint, patient) {
  if (!CLOUD_READY) return null;
  const meta = await axios.get(`https://graph.facebook.com/v19.0/${mediaId}`,
    { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` } });
  const fileRes = await axios.get(meta.data.url, {
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` },
    responseType: "arraybuffer",
  });
  const mime = meta.data.mime_type || "application/octet-stream";
  const b64  = Buffer.from(fileRes.data).toString("base64");
  const dataUri = `data:${mime};base64,${b64}`;
  const up = await cloudinary.uploader.upload(dataUri, {
    folder: `vedic/patients/${patient._id}`,
    resource_type: "auto",
    type: "authenticated",          // ← cannot be opened without a signed URL
  });
  return Document.create({
    patientId: patient._id, patientName: patient.name, patientPhone: patient.phone,
    kind: kindHint,
    publicId: up.public_id, resourceType: up.resource_type, format: up.format, bytes: up.bytes,
    uploadedVia: "whatsapp",
  });
}

// Build a short-lived signed URL so the dashboard can view a document
function signedUrl(doc, ttlSeconds = 300) {
  return cloudinary.url(doc.publicId, {
    type: "authenticated", resource_type: doc.resourceType,
    sign_url: true, secure: true,
    expires_at: Math.floor(Date.now() / 1000) + ttlSeconds,
  });
}

// Free slots for a given date (single doctor → any confirmed appt blocks the slot)
async function freeSlots(date) {
  const taken = (await Appointment.find({ date, status: "confirmed" })).map(a => a.time);
  return SLOTS.filter(s => !taken.includes(s));
}

// ─── AI (single doctor, dental) ──────────────────────────────────────
const SYSTEM_PROMPT = `You are the receptionist chatbot for ${CLINIC}, a dental clinic in Delhi NCR, India.
DOCTOR: ${DOCTOR_NAME} (the only dentist; handles everything).
HOURS: Monday to Saturday, 10 AM–7 PM. Closed Sunday.
CONSULTATION FEE: Rs ${CONSULT_FEE}. Video consultation available.
RULES:
- Warm, friendly, concise (under 80 words). No markdown symbols.
- VERY IMPORTANT: You CANNOT confirm or book appointments. The booking system does that automatically and ONLY after it has BOTH a date and a time. So you must NEVER say an appointment is "confirmed", "booked", or "scheduled", and NEVER promise to send a video link. Saying so would be a lie because nothing is saved yet.
- When a patient wants to book, your ONLY job is to collect the missing details: (1) which DATE, (2) which TIME, (3) clinic or video, (4) the reason/problem. If a date or time is missing, ask for it plainly and stop. Do not pretend it is done.
- If the user writes Hindi/Hinglish, reply in the same language.
- There is only one dentist, ${DOCTOR_NAME}. Never invent other doctors.`;

async function getAIReply(phone, msg, lang, ctx = "") {
  if (!conversations[phone]) conversations[phone] = [];
  const h = conversations[phone];
  h.push({ role: "user", content: msg });
  const recent = h.filter(m => m.role === "user" || m.role === "assistant").slice(-10);
  try {
    const r = await axios.post("https://api.groq.com/openai/v1/chat/completions", {
      model: "llama-3.3-70b-versatile", max_tokens: 280, temperature: 0.7,
      messages: [{ role: "system", content: SYSTEM_PROMPT + (lang === "hi" ? "\nReply in Hindi/Hinglish." : "") + ctx }, ...recent],
    }, { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" } });
    const reply = r.data?.choices?.[0]?.message?.content || "Please call us.";
    h.push({ role: "assistant", content: reply });
    if (h.length > 20) h.splice(0, 2);
    return reply;
  } catch { return lang === "hi" ? "Technical dikkat aa rahi hai, kripya call karein." : "Technical issue, please call us."; }
}

// ════════════════════════════════════════════════════════════════════
//  WEBHOOK
// ════════════════════════════════════════════════════════════════════

// (#6) create a confirmed booking + notify patient and doctor (reason included)
async function createBooking({ from, patient, cleanPhone, lang, date, time, mode, type, reason }) {
  const appt = await Appointment.create({
    patientId: patient._id, patientName: patient.name, patientPhone: cleanPhone,
    therapist: DOCTOR_NAME, date, time,
    type: type || "Consultation", status: "confirmed",
    reason: reason || undefined,
    mode, language: lang, payStatus: "clinic", amount: CONSULT_FEE,
    videoLink: mode === "video" ? (process.env.ZOOM_LINK || `https://meet.jit.si/VedicDental-${Date.now().toString(36)}`) : undefined,
    bookedVia: "whatsapp",
  });
  await sendMessage(from, T.booked(lang, appt));
  await sendMessage(DOCTOR_PHONE, `🆕 New booking\n\n${appt.patientName} (${cleanPhone})\n${appt.type} · ${mode === "video" ? "🎥 video" : "📍 clinic"}\n📅 ${appt.date} ${appt.time}${appt.reason ? `\n📝 Reason: ${appt.reason}` : ""}${mode === "video" && appt.videoLink ? `\n🎥 Join: ${appt.videoLink}` : ""}\n\n— ${CLINIC}`);
  return appt;
}

app.get("/webhook", (req, res) => {
  const { "hub.mode": mode, "hub.verify_token": token, "hub.challenge": challenge } = req.query;
  if (mode === "subscribe" && token === process.env.VERIFY_TOKEN) return res.status(200).send(challenge);
  res.sendStatus(403);
});

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  try {
    if (req.body.object !== "whatsapp_business_account") return;
    const message = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!message) return;
    const from = message.from;
    const cleanPhone = from.replace(/\D/g, "").slice(-10);
    if (!dbConnected) return;

    let patient = await Patient.findOne({ phone: cleanPhone });
    const lang = patient?.language || "en";

    // ── (#8) DOCUMENT / IMAGE UPLOAD via WhatsApp ──────────────────────
    if (message.type === "image" || message.type === "document") {
      if (!patient) { await sendMessage(from, T.langAsk()); return; }
      const mediaId = message.image?.id || message.document?.id;
      const caption = (message.image?.caption || message.document?.caption || "").toLowerCase();
      const kind = caption.includes("xray") || caption.includes("x-ray") ? "xray"
                 : caption.includes("prescription") || caption.includes("rx") ? "prescription"
                 : message.type === "document" ? "report" : "image";
      try {
        const saved = await storeWhatsappMedia(mediaId, kind, patient);
        if (saved) {
          await sendMessage(from, T.docSaved(lang));
        } else {
          await sendMessage(from, lang === "hi"
            ? "Abhi document upload setup nahi hua hai — kripya document seedhe clinic ko bhejein. 🙏"
            : "Document upload isn't set up yet — please share it with the clinic directly. 🙏");
        }
      } catch (e) {
        console.error("Doc upload error:", e.message);
        await sendMessage(from, lang === "hi" ? "Document save nahi ho paya, kripya dobara bhejein." : "Couldn't save the document, please resend.");
      }
      return;
    }

    if (message.type !== "text") return;
    const text  = message.text.body.trim();
    const lower = text.toLowerCase();
    const hist  = conversations[from] || (conversations[from] = []);

    // ── FIRST CONTACT → ask language only (no forced registration) ─────
    if (!patient) {
      patient = await Patient.create({
        name: `Patient ${cleanPhone.slice(-4)}`, phone: cleanPhone,
        notes: `First contact: "${text}"`, source: "whatsapp", profileComplete: false,
      });
      hist.length = 0; hist.push({ role: "system", content: "WAITING_FOR_LANGUAGE" });
      await sendMessage(from, T.langAsk());
      return;
    }

    // ── (#3) LANGUAGE SELECTION ────────────────────────────────────────
    if (hist.some(m => m.content === "WAITING_FOR_LANGUAGE")) {
      const chosen = (lower.includes("1") || lower.includes("hindi") || lower.includes("हिंदी")) ? "hi"
                   : (lower.includes("2") || lower.includes("english")) ? "en" : null;
      if (!chosen) { await sendMessage(from, T.langAsk()); return; }
      await Patient.findByIdAndUpdate(patient._id, { language: chosen });
      conversations[from] = hist.filter(m => m.content !== "WAITING_FOR_LANGUAGE");
      await sendMessage(from, T.menu(chosen, null));
      return;
    }

    // ── (#2) PROFILE COLLECTION (one message: name, email, address) ────
    if (hist.some(m => m.content === "WAITING_FOR_PROFILE")) {
      const email = (text.match(/[^\s,;]+@[^\s,;]+\.[^\s,;]+/) || [])[0];
      if (!email) { await sendMessage(from, T.profileNeedEmail(lang)); return; }
      let rest = text.replace(email, "").replace(/[\n;|]/g, ",");
      const parts = rest.split(",").map(s => s.trim()).filter(Boolean);
      const name = parts[0] || patient.name;
      const address = parts.slice(1).join(", ") || "";
      await Patient.findByIdAndUpdate(patient._id, { name, email, address, profileComplete: true });
      patient.name = name; patient.profileComplete = true;
      conversations[from] = hist.filter(m => m.content !== "WAITING_FOR_PROFILE");
      await sendMessage(from, T.profileDone(lang, name));
      return;
    }

    // ── (#6) PENDING BOOKING — patient's reply is the consultation reason ──
    const pendingEntry = hist.find(m => m.pendingBooking);
    if (pendingEntry) {
      const pb = pendingEntry.pendingBooking;
      conversations[from] = hist.filter(m => !m.pendingBooking);
      const clash = await Appointment.findOne({ date: pb.date, time: pb.time, status: "confirmed" });
      if (clash) {
        const free = await freeSlots(pb.date);
        await sendMessage(from, free.length ? T.slotTaken(lang, pb.time, free.slice(0, 8).join("   ")) : T.noSlots(lang));
        return;
      }
      await createBooking({ from, patient, cleanPhone, lang, date: pb.date, time: pb.time, mode: pb.mode, type: pb.type, reason: text.trim() });
      return;
    }

    // ── (#10) the bot no longer asks for 1–5 rating; reviews go to Google.

    // ── QUICK COMMANDS ─────────────────────────────────────────────────
    if (["hi", "hello", "hey", "start", "menu", "namaste"].includes(lower)) {
      await sendMessage(from, T.menu(lang, patient.profileComplete ? patient.name : null)); return;
    }
    if (lower.includes("fee") || lower.includes("price") || lower.includes("timing") || lower.includes("charge")) {
      await sendMessage(from, T.fees(lang)); return;
    }
    if (["human", "receptionist", "reception", "call"].includes(lower)) {
      await sendMessage(from, T.human(lang)); return;
    }

    // ── MY APPOINTMENTS ────────────────────────────────────────────────
    if (["my appointments", "appointments", "bookings", "meri appointments", "2"].includes(lower)) {
      const appts = await Appointment.find({ patientPhone: cleanPhone, status: "confirmed" }).sort({ date: 1 }).limit(5);
      if (appts.length) {
        const list = appts.map((a, i) => `${i + 1}. ${a.type} — ${a.date} ${a.time} (${a.mode === "video" ? "🎥 video" : "📍 clinic"})`).join("\n");
        await sendMessage(from, `📋 ${lang === "hi" ? "Aapki appointments" : "Your appointments"}:\n\n${list}\n\n${lang === "hi" ? "Cancel karne ke liye: CANCEL <number>" : "To cancel: CANCEL <number>"}`);
        conversations[from] = (conversations[from] || []).filter(m => !m.appointmentList);
        conversations[from].push({ appointmentList: appts.map(a => a._id.toString()) });
      } else {
        await sendMessage(from, lang === "hi" ? "Koi upcoming appointment nahi. BOOK type karein." : "No upcoming appointments. Type BOOK to schedule.");
      }
      return;
    }

    // ── (#7) CANCEL → notify patient + doctor ──────────────────────────
    if (lower.startsWith("cancel")) {
      const m = text.match(/cancel\s+(\d+)/i);
      const entry = (conversations[from] || []).find(x => x.appointmentList);
      if (m && entry?.appointmentList[parseInt(m[1]) - 1]) {
        const appt = await Appointment.findById(entry.appointmentList[parseInt(m[1]) - 1]);
        if (appt && appt.status === "confirmed") {
          appt.status = "cancelled";
          appt.cancellation = { cancelledAt: new Date(), reason: "Patient cancelled via WhatsApp", by: "patient" };
          await appt.save();
          await sendMessage(from, lang === "hi" ? `✅ Cancel ho gaya: ${appt.type} — ${appt.date} ${appt.time}` : `✅ Cancelled: ${appt.type} — ${appt.date} ${appt.time}`);
          await sendMessage(DOCTOR_PHONE, `⚠️ Appointment CANCELLED\n\n${appt.patientName} (${appt.patientPhone})\n${appt.type}\n📅 ${appt.date} ${appt.time}\n\n— ${CLINIC}`);
        }
      }
      return;
    }

    // ── BOOKING ────────────────────────────────────────────────────────
    const bookWords = ["book", "appointment", "schedule", "slot", "visit", "tomorrow", "today", "morning", "evening", "am", "pm", "baje", "kal", "aaj", "video", "consult", "1"];
    if (bookWords.some(k => lower.includes(k))) {
      // gate: profile must be complete first (#2)
      if (!patient.profileComplete) {
        conversations[from] = (conversations[from] || []).filter(m => m.content !== "WAITING_FOR_PROFILE");
        conversations[from].push({ role: "system", content: "WAITING_FOR_PROFILE" });
        await sendMessage(from, T.profileAsk(lang));
        return;
      }

      try {
        const convHistory = (conversations[from] || []).filter(m => m.role && m.content && !m.appointmentList).slice(-8)
          .map(m => `${m.role === "user" ? "Patient" : "Bot"}: ${m.content}`).join("\n");
        const ex = await axios.post("https://api.groq.com/openai/v1/chat/completions", {
          model: "llama-3.3-70b-versatile", max_tokens: 160, temperature: 0,
          messages: [{
            role: "system",
            content: `Extract a dental appointment. Today: ${istDate()}. Tomorrow: ${new Date(Date.parse(istDate()) + 86400000).toISOString().split("T")[0]}.
Return ONLY JSON: {"hasAppointment":bool,"date":"YYYY-MM-DD or null","time":"HH:MM or null","mode":"clinic or video","type":"Consultation/Cleaning/Filling/Root Canal/Checkup or null","reason":"the dental problem/reason the patient gave in their own words, or null"}
hasAppointment=true only if BOTH date AND time are present. mode="video" if patient mentions video/online.`
          }, { role: "user", content: `${convHistory}\nPatient: ${text}` }],
        }, { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" } });
        const d = JSON.parse(ex.data?.choices?.[0]?.message?.content || "{}");

        if (d.hasAppointment && d.date && d.time) {
          // (#4) SLOT CONFLICT CHECK
          const clash = await Appointment.findOne({ date: d.date, time: d.time, status: "confirmed" });
          if (clash) {
            const free = await freeSlots(d.date);
            if (!free.length) { await sendMessage(from, T.noSlots(lang)); return; }
            await sendMessage(from, T.slotTaken(lang, d.time, free.slice(0, 8).join("   "))); return;
          }
          const mode = d.mode === "video" ? "video" : "clinic";
          // (#6) reason is required — if patient hasn't said it yet, ask + show fee, hold the booking
          if (!d.reason) {
            conversations[from] = (conversations[from] || []).filter(m => !m.pendingBooking);
            conversations[from].push({ pendingBooking: { date: d.date, time: d.time, mode, type: d.type || "Consultation" } });
            await sendMessage(from, T.askReason(lang));
            return;
          }
          await createBooking({ from, patient, cleanPhone, lang, date: d.date, time: d.time, mode, type: d.type, reason: d.reason });
          return;
        }
        // partial booking info → ask for the missing piece ourselves (never let the AI fake a confirmation)
        if (d.time && !d.date) { await sendMessage(from, T.askDate(lang, d.time)); return; }
        if (d.date && !d.time) { await sendMessage(from, T.askTime(lang, d.date)); return; }
      } catch (e) { console.log("Extraction error:", e.message); }
    }

    // ── AI FALLBACK ────────────────────────────────────────────────────
    let ctx = "";
    if (patient.profileComplete) {
      const recent = await Appointment.find({ patientPhone: cleanPhone }).sort({ createdAt: -1 }).limit(2);
      if (recent.length) ctx = `\n\nPatient: ${patient.name}. Recent: ${recent.map(a => `${a.type} ${a.date}`).join(", ")}`;
    }
    await sendMessage(from, await getAIReply(from, text, lang, ctx));
  } catch (err) { console.error("Webhook error:", err.message); }
});

// ════════════════════════════════════════════════════════════════════
//  CRON ENDPOINTS  (trigger these from cron-job.org — see setup guide)
//  Protect with ?key=CRON_SECRET
// ════════════════════════════════════════════════════════════════════
function cronGuard(req, res) {
  if (process.env.CRON_SECRET && req.query.key !== process.env.CRON_SECRET) { res.status(403).json({ error: "forbidden" }); return false; }
  return true;
}

// (#2) REMINDER 1 of 3 — evening before: message patients with an appointment TOMORROW
app.all("/api/cron/patient-daybefore", async (req, res) => {
  if (!cronGuard(req, res)) return;
  const t = new Date(Date.now() + 5.5 * 3600 * 1000 + 24 * 3600 * 1000); // IST tomorrow
  const tomorrow = t.toISOString().split("T")[0];
  const appts = await Appointment.find({ date: tomorrow, status: "confirmed", "reminders.dayBeforeSent": { $ne: true } });
  for (const a of appts) {
    const hi = a.language === "hi";
    await sendMessage(a.patientPhone, hi
      ? `📅 Reminder: kal aapki appointment hai, ${a.patientName}!\n🦷 ${a.type} — ${a.time}\n${a.mode === "video" ? "🎥 video consultation" : "📍 " + CLINIC}\n\nKisi badlav ke liye reply karein. — ${CLINIC}`
      : `📅 Reminder: you have an appointment tomorrow, ${a.patientName}!\n🦷 ${a.type} — ${a.time}\n${a.mode === "video" ? "🎥 video consultation" : "📍 " + CLINIC}\n\nReply here for any changes. — ${CLINIC}`);
    a.reminders.dayBeforeSent = true; await a.save();
  }
  res.json({ sent: appts.length });
});

// (#6) 8 AM — morning reminder to every patient with an appointment today
app.all("/api/cron/patient-morning", async (req, res) => {
  if (!cronGuard(req, res)) return;
  const today = istDate();
  const appts = await Appointment.find({ date: today, status: "confirmed", "reminders.morningSent": { $ne: true } });
  for (const a of appts) {
    const hi = a.language === "hi";
    await sendMessage(a.patientPhone, hi
      ? `🌅 Shubh prabhat ${a.patientName}!\n\nAaj aapki appointment hai:\n🦷 ${a.type} — ${a.time}\n${a.mode === "video" ? "🎥 " + a.videoLink : "📍 " + CLINIC}\n\nMilte hain! — ${CLINIC}`
      : `🌅 Good morning ${a.patientName}!\n\nYou have an appointment today:\n🦷 ${a.type} — ${a.time}\n${a.mode === "video" ? "🎥 " + a.videoLink : "📍 " + CLINIC}\n\nSee you! — ${CLINIC}`);
    a.reminders.morningSent = true; await a.save();
  }
  res.json({ sent: appts.length });
});

// (#5) 9 AM — full day schedule to the doctor before clinic opens
app.all("/api/cron/doctor-morning", async (req, res) => {
  if (!cronGuard(req, res)) return;
  const today = istDate();
  const appts = await Appointment.find({ date: today, status: "confirmed" }).sort({ time: 1 });
  if (!appts.length) {
    await sendMessage(DOCTOR_PHONE, `🗓 ${today}\n\nAaj koi appointment nahi.\n\n— ${CLINIC}`);
  } else {
    const lines = appts.map((a, i) => `${i + 1}. ${a.time} · ${a.patientName}\n   ${a.type} · ${a.mode === "video" ? "🎥 video" : "📍 clinic"} · ₹${a.amount}`).join("\n\n");
    await sendMessage(DOCTOR_PHONE, `🗓 Aaj ki appointments (${today})\n\n${appts.length} patients\n\n${lines}\n\n— ${CLINIC}`);
  }
  res.json({ sent: 1, count: appts.length });
});

// (#2) REMINDER 3 of 3 — every ~15 min, send the "1 hour before" reminder when due
app.all("/api/cron/reminders", async (req, res) => {
  if (!cronGuard(req, res)) return;
  const today = istDate();
  const appts = await Appointment.find({ date: today, status: "confirmed" });
  let sent = 0;
  for (const a of appts) {
    const mins = minsUntil(a.date, a.time);
    const hi = a.language === "hi";
    if (mins <= 65 && mins >= 45 && !a.reminders.hourSent) {
      await sendMessage(a.patientPhone, hi
        ? `⏰ Reminder: 1 ghante mein aapki appointment hai (${a.time}).\n${a.mode === "video" ? "🎥 " + a.videoLink : "📍 " + CLINIC}`
        : `⏰ Reminder: your appointment is in 1 hour (${a.time}).\n${a.mode === "video" ? "🎥 " + a.videoLink : "📍 " + CLINIC}`);
      a.reminders.hourSent = true; await a.save(); sent++;
    }
  }
  res.json({ sent });
});

// (#11) package renewal — when a patient's package is almost finished, nudge them
// on WhatsApp + email to renew. Trigger daily from cron-job.org.
app.all("/api/cron/package-renewal", async (req, res) => {
  if (!cronGuard(req, res)) return;
  // active packages with 2 or fewer sessions left, not yet reminded
  const pkgs = await Package.find({ active: true, renewalNotified: { $ne: true } });
  let sent = 0;
  for (const pkg of pkgs) {
    const left = Math.max(0, (pkg.total || 0) - (pkg.done || 0));
    if (left > 2) continue;
    const patient = pkg.patientId ? await Patient.findById(pkg.patientId) : null;
    const phone = pkg.patientPhone || patient?.phone;
    const hi = (patient?.language || "en") === "hi";
    if (phone) {
      await sendMessage(phone, hi
        ? `🔔 ${pkg.patientName || "Namaste"}, aapka package "${pkg.name}" ${left === 0 ? "complete ho chuka hai" : `mein sirf ${left} session bache hain`}. Renew karne ke liye reply karein ya clinic se baat karein. — ${CLINIC}`
        : `🔔 ${pkg.patientName || "Hi"}, your package "${pkg.name}" ${left === 0 ? "is complete" : `has only ${left} session(s) left`}. Reply to renew or contact the clinic. — ${CLINIC}`);
    }
    if (MAIL_READY && patient?.email) {
      try {
        await mailer.sendMail({
          from: process.env.SMTP_FROM || process.env.SMTP_USER,
          to: patient.email,
          subject: `Package renewal reminder — ${CLINIC}`,
          html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;border:1px solid #eee;border-radius:10px;overflow:hidden">
            <div style="background:#0E7490;color:#fff;padding:16px 20px"><h2 style="margin:0">🦷 ${CLINIC}</h2></div>
            <div style="padding:20px;font-size:14px;color:#333">
              <p>Namaste ${pkg.patientName || ""},</p>
              <p>Aapka treatment package <b>"${pkg.name}"</b> ${left === 0 ? "complete ho chuka hai" : `lagbhag complete ho raha hai — sirf <b>${left} session</b> bache hain`}.</p>
              <p>Treatment continue rakhne ke liye package renew karwa lein. Koi bhi sawaal ho to WhatsApp par reply karein.</p>
              <p style="margin-top:18px;color:#888;font-size:12px">— ${DOCTOR_NAME}, ${CLINIC}</p>
            </div></div>`,
        });
      } catch (e) { console.error("Renewal email:", e.message); }
    }
    pkg.renewalNotified = true; await pkg.save(); sent++;
  }
  res.json({ sent });
});

// ════════════════════════════════════════════════════════════════════
//  INVOICE EMAIL  (#12)
// ════════════════════════════════════════════════════════════════════
function invoiceHtml(inv) {
  const rows = inv.items.map(it => `<tr><td style="padding:8px;border-bottom:1px solid #eee">${it.description}</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:center">${it.quantity}</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right">₹${it.unitPrice}</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right">₹${it.amount}</td></tr>`).join("");
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;border:1px solid #eee;border-radius:10px;overflow:hidden">
    <div style="background:#0E7490;color:#fff;padding:18px 22px"><h2 style="margin:0">🦷 ${CLINIC}</h2><div style="opacity:.9;font-size:13px">${DOCTOR_NAME}</div></div>
    <div style="padding:22px">
      <p style="margin:0 0 4px"><b>Invoice:</b> ${inv.invoiceNumber}</p>
      <p style="margin:0 0 4px"><b>Patient:</b> ${inv.patientName}</p>
      <p style="margin:0 0 14px"><b>Date:</b> ${new Date(inv.paidAt || inv.createdAt).toLocaleDateString("en-IN")}</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr style="background:#f8fafc"><th style="padding:8px;text-align:left">Item</th><th style="padding:8px">Qty</th><th style="padding:8px;text-align:right">Rate</th><th style="padding:8px;text-align:right">Amount</th></tr>
        ${rows}
      </table>
      <div style="text-align:right;margin-top:14px;font-size:14px">
        <div>Subtotal: ₹${inv.subtotal}</div>
        ${inv.discount ? `<div>Discount: −₹${inv.discount}</div>` : ""}
        ${inv.tax ? `<div>Tax: ₹${inv.tax}</div>` : ""}
        <div style="font-size:18px;font-weight:700;margin-top:6px">Total Paid: ₹${inv.totalAmount}</div>
        <div style="font-size:12px;color:#16a34a">✓ Paid at clinic (${inv.paymentMethod})</div>
      </div>
      <p style="margin-top:20px;font-size:12px;color:#888">Thank you for visiting ${CLINIC}.</p>
    </div></div>`;
}

async function emailInvoice(inv) {
  if (!MAIL_READY || !inv.patientEmail) return false;
  await mailer.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: inv.patientEmail,
    subject: `Invoice ${inv.invoiceNumber} — ${CLINIC}`,
    html: invoiceHtml(inv),
  });
  inv.emailedAt = new Date(); await inv.save();
  return true;
}

// ════════════════════════════════════════════════════════════════════
//  REST API
// ════════════════════════════════════════════════════════════════════
// PATIENTS
app.get("/api/patients", async (req, res) => { try { res.json(await Patient.find().sort({ createdAt: -1 })); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post("/api/patients", async (req, res) => { try { const p = new Patient(req.body); await p.save(); res.json(p); } catch (e) { res.status(500).json({ error: e.message }); } });
app.put("/api/patients/:id", async (req, res) => { try { const p = await Patient.findByIdAndUpdate(req.params.id, req.body, { new: true }); if (!p) return res.status(404).json({ error: "Not found" }); res.json(p); } catch (e) { res.status(500).json({ error: e.message }); } });

// APPOINTMENTS
app.get("/api/appointments", async (req, res) => { try { res.json(await Appointment.find().sort({ createdAt: -1 })); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post("/api/appointments", async (req, res) => {
  try {
    // dashboard booking also respects slot conflict (#4)
    const clash = await Appointment.findOne({ date: req.body.date, time: req.body.time, status: "confirmed" });
    if (clash) return res.status(409).json({ error: "Slot already booked", freeSlots: await freeSlots(req.body.date) });
    const a = new Appointment({ amount: CONSULT_FEE, payStatus: "clinic", ...req.body, therapist: DOCTOR_NAME });
    await a.save(); res.json(a);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// (#11 + #12) mark paid manually → create + email invoice
app.put("/api/appointments/:id", async (req, res) => {
  try {
    const a = await Appointment.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!a) return res.status(404).json({ error: "Not found" });
    if (req.body.payStatus === "paid") {
      const patient = await Patient.findById(a.patientId);
      let inv = await Invoice.findOne({ appointmentId: a._id });
      if (!inv) {
        inv = new Invoice({
          patientId: a.patientId, patientName: a.patientName, patientPhone: a.patientPhone,
          patientEmail: patient?.email, appointmentId: a._id,
          items: [{ description: `${a.type} — ${DOCTOR_NAME}`, quantity: 1, unitPrice: a.amount || CONSULT_FEE }],
          amountPaid: a.amount || CONSULT_FEE, paymentMethod: "cash", paidAt: new Date(),
        });
        await inv.save();
        emailInvoice(inv).catch(e => console.error("Invoice email:", e.message));
      }
      return res.json({ appointment: a, invoiceId: inv._id });
    }
    res.json(a);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// (#7) cancel from dashboard → notify both
app.post("/api/appointments/:id/cancel", async (req, res) => {
  try {
    const a = await Appointment.findById(req.params.id);
    if (!a) return res.status(404).json({ error: "Not found" });
    a.status = "cancelled";
    a.cancellation = { cancelledAt: new Date(), reason: req.body.reason || "Cancelled by clinic", by: "clinic" };
    await a.save();
    await sendMessage(a.patientPhone, a.language === "hi"
      ? `⚠️ Aapki appointment cancel ho gayi:\n${a.type} — ${a.date} ${a.time}\nNayi appointment ke liye BOOK type karein.\n— ${CLINIC}`
      : `⚠️ Your appointment was cancelled:\n${a.type} — ${a.date} ${a.time}\nType BOOK to reschedule.\n— ${CLINIC}`);
    await sendMessage(DOCTOR_PHONE, `⚠️ Cancelled: ${a.patientName} · ${a.type} · ${a.date} ${a.time}`);
    res.json(a);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PACKAGES (#9 — these already work; kept intact)
app.get("/api/packages", async (req, res) => { try { res.json(await Package.find().sort({ createdAt: -1 })); } catch (e) { res.status(500).json({ error: e.message }); } });
app.get("/api/packages/:patientId", async (req, res) => { try { res.json(await Package.find({ patientId: req.params.patientId }).sort({ createdAt: -1 })); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post("/api/packages", async (req, res) => { try { const p = new Package(req.body); await p.save(); res.json(p); } catch (e) { res.status(500).json({ error: e.message }); } });
app.put("/api/packages/:id", async (req, res) => { try { res.json(await Package.findByIdAndUpdate(req.params.id, req.body, { new: true })); } catch (e) { res.status(500).json({ error: e.message }); } });

// (#9) mark a package as PAID — so its amount shows up in earnings as a session payment
app.post("/api/packages/:id/mark-paid", async (req, res) => {
  try {
    const pkg = await Package.findByIdAndUpdate(req.params.id, { payStatus: "paid", paidAt: new Date() }, { new: true });
    if (!pkg) return res.status(404).json({ error: "Package not found" });
    if (pkg.patientPhone) {
      const pt = pkg.patientId ? await Patient.findById(pkg.patientId) : null;
      const hi = (pt?.language || "en") === "hi";
      try { await sendMessage(pkg.patientPhone, hi
        ? `🧾 Payment mila — ₹${pkg.amount || 0} ("${pkg.name}" ke liye). Dhanyavaad! — ${CLINIC}`
        : `🧾 Payment received — ₹${pkg.amount || 0} for "${pkg.name}". Thank you! — ${CLINIC}`); } catch (e) {}
    }
    res.json({ updated: pkg });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PACKAGE TEMPLATES — the catalog of sellable packages (name, sessions, price)
app.get("/api/package-templates", async (req, res) => { try { res.json(await PackageTemplate.find({ isActive: true }).sort({ createdAt: -1 })); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post("/api/package-templates", async (req, res) => { try { const t = new PackageTemplate(req.body); await t.save(); res.json(t); } catch (e) { res.status(400).json({ error: e.message }); } });
app.put("/api/package-templates/:id", async (req, res) => { try { res.json(await PackageTemplate.findByIdAndUpdate(req.params.id, req.body, { new: true })); } catch (e) { res.status(500).json({ error: e.message }); } });
app.delete("/api/package-templates/:id", async (req, res) => { try { await PackageTemplate.findByIdAndUpdate(req.params.id, { isActive: false }); res.json({ deleted: true }); } catch (e) { res.status(500).json({ error: e.message }); } });

// (#2) mark one session as done — the dashboard "Mark session" button hits this
app.post("/api/packages/:id/mark-session", async (req, res) => {
  try {
    const pkg = await Package.findById(req.params.id);
    if (!pkg) return res.status(404).json({ error: "Package not found" });
    if ((pkg.done || 0) >= pkg.total) return res.status(400).json({ error: "All sessions already used" });
    pkg.done = (pkg.done || 0) + 1;
    if (pkg.done >= pkg.total) pkg.active = false;
    await pkg.save();
    try { await Session.create({ packageId: pkg._id, patientId: pkg.patientId, no: pkg.done, date: istDate() }); } catch (e) {}
    const left = Math.max(0, pkg.total - pkg.done);
    // (#2) every time a session is marked, tell the patient how many are left — in their language
    if (pkg.patientPhone) {
      const pt = pkg.patientId ? await Patient.findById(pkg.patientId) : null;
      const hi = (pt?.language || "en") === "hi";
      const msg = left === 0
        ? (hi
            ? `✅ Aapka package "${pkg.name}" complete ho gaya hai — saare ${pkg.total} sessions ho gaye. 🙏\nAage continue karne ke liye reply karein. — ${CLINIC}`
            : `✅ Your package "${pkg.name}" is complete — all ${pkg.total} sessions done. 🙏\nReply to continue further. — ${CLINIC}`)
        : (hi
            ? `✅ Aaj ka session mark ho gaya (${pkg.done}/${pkg.total}).\nPackage "${pkg.name}" mein ab *${left} session* bache hain. — ${CLINIC}`
            : `✅ Today's session is marked (${pkg.done}/${pkg.total}).\nYou have *${left} session(s)* left in "${pkg.name}". — ${CLINIC}`);
      try { await sendMessage(pkg.patientPhone, msg); } catch (e) { console.log("Session msg error:", e.message); }
    }
    res.json({ updated: pkg });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// (#9) TREATMENT PLANS — these routes were MISSING, so plans never saved. Added now.
app.get("/api/treatment-plans/:patientId", async (req, res) => { try { res.json(await TreatmentPlan.find({ patientId: req.params.patientId }).sort({ createdAt: -1 })); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post("/api/treatment-plans", async (req, res) => { try { const t = new TreatmentPlan(req.body); await t.save(); res.json(t); } catch (e) { res.status(500).json({ error: e.message }); } });
app.put("/api/treatment-plans/:id", async (req, res) => { try { res.json(await TreatmentPlan.findByIdAndUpdate(req.params.id, req.body, { new: true })); } catch (e) { res.status(500).json({ error: e.message }); } });

// SESSIONS
app.get("/api/sessions/:packageId", async (req, res) => { try { res.json(await Session.find({ packageId: req.params.packageId }).sort({ no: 1 })); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post("/api/sessions", async (req, res) => { try { const s = new Session(req.body); await s.save(); res.json(s); } catch (e) { res.status(500).json({ error: e.message }); } });

// (#8 + #13) DOCUMENTS — list metadata, fetch a short-lived signed URL on demand
app.get("/api/documents/:patientId", async (req, res) => { try { res.json(await Document.find({ patientId: req.params.patientId }).sort({ createdAt: -1 })); } catch (e) { res.status(500).json({ error: e.message }); } });
app.get("/api/documents/:id/url", async (req, res) => {
  try {
    if (!CLOUD_READY) return res.status(503).json({ error: "Cloudinary not configured" });
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: "Not found" });
    res.json({ url: signedUrl(doc), expiresIn: 300 });   // valid 5 minutes only
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// INVOICES (#12 + #15) — list, get one (real-time invoice page), create manual
app.get("/api/invoices", async (req, res) => { try { res.json(await Invoice.find().sort({ createdAt: -1 })); } catch (e) { res.status(500).json({ error: e.message }); } });
app.get("/api/invoices/:id", async (req, res) => { try { const inv = await Invoice.findById(req.params.id); if (!inv) return res.status(404).json({ error: "Not found" }); res.json(inv); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post("/api/invoices", async (req, res) => {
  try { const inv = new Invoice(req.body); await inv.save(); if (inv.status === "paid") emailInvoice(inv).catch(() => {}); res.json(inv); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post("/api/invoices/:id/email", async (req, res) => {
  try { const inv = await Invoice.findById(req.params.id); if (!inv) return res.status(404).json({ error: "Not found" }); const ok = await emailInvoice(inv); res.json({ emailed: ok }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// FEEDBACK (#10) — send a Google review link to the patient
app.get("/api/feedback", async (req, res) => { try { res.json(await Feedback.find().sort({ createdAt: -1 })); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post("/api/send-feedback/:appointmentId", async (req, res) => {
  try {
    const a = await Appointment.findById(req.params.appointmentId);
    if (!a) return res.status(404).json({ error: "Appointment not found" });
    if (!REVIEW_LINK) return res.status(400).json({ error: "Set GOOGLE_REVIEW_LINK env first" });
    await sendMessage(a.patientPhone, T.reviewMsg(a.language || "en", a.patientName));
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// (#14) MONTHLY STATS — for the dashboard trend graphs
app.get("/api/stats/monthly", async (req, res) => {
  try {
    const months = [];
    const base = istNow();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
      const start = d.toISOString().split("T")[0];
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString().split("T")[0];
      const appts = await Appointment.find({ date: { $gte: start, $lt: end } });
      const revenue = appts.filter(a => a.payStatus === "paid").reduce((s, a) => s + (a.amount || 0), 0);
      const newPatients = await Patient.countDocuments({ createdAt: { $gte: new Date(start), $lt: new Date(end) } });
      months.push({
        month: d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }),
        appointments: appts.length,
        completed: appts.filter(a => a.status === "confirmed" || a.status === "completed").length,
        cancelled: appts.filter(a => a.status === "cancelled").length,
        revenue, newPatients,
      });
    }
    res.json(months);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// HEALTH
app.get("/", (req, res) => res.json({
  status: "running", clinic: CLINIC,
  db: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  cloudinary: CLOUD_READY, email: MAIL_READY,
  upi: UPIID,
}));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 ${CLINIC} bot running on port ${PORT}`));
