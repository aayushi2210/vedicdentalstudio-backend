const mongoose = require('mongoose');
const {
  PHONE_REGEX, DATE_REGEX, TIME_REGEX,
  APPOINTMENT_STATUS, BOOKING_SOURCES,
  isValidDateString,
} = require('./validators');
const { ObjectId } = mongoose.Schema.Types;

const appointmentSchema = new mongoose.Schema({
  clinicId:     { type: ObjectId, ref: 'Clinic' },
  patientId:    { type: ObjectId, ref: 'Patient', required: [true, 'patientId is required'] },
  patientName:  { type: String, trim: true },
  patientPhone: { type: String, match: [PHONE_REGEX, 'Enter a valid phone number'] },
  bookedForName:{ type: String, trim: true },
  therapist:    { type: String, trim: true },   // single doctor name

  date: { type: String, required: [true, 'Date is required'],
          match: [DATE_REGEX, 'Date must be in YYYY-MM-DD format'],
          validate: { validator: isValidDateString, message: 'Invalid calendar date' } },
  time: { type: String, required: [true, 'Time is required'],
          match: [TIME_REGEX, 'Time must be in HH:MM (24-hour) format'] },
  durationMinutes: { type: Number, default: 30, min: [5, 'Minimum 5 minutes'] },

  type:   { type: String, required: [true, 'Appointment type is required'], trim: true },
  status: { type: String, enum: { values: APPOINTMENT_STATUS, message: '{VALUE} is not a valid status' },
            default: 'confirmed' },

  // NEW — clinic visit vs video consultation
  mode:      { type: String, enum: ['clinic', 'video'], default: 'clinic' },
  videoLink: { type: String, trim: true },     // Jitsi room link for video consults
  reason:    { type: String, trim: true },      // why the patient wants the consultation
  language:  { type: String, enum: ['hi', 'en'], default: 'en' },

  // Payment is clinic-only; doctor marks paid manually from the dashboard.
  payStatus: { type: String, default: 'pending' },   // pending | clinic | paid
  amount:    { type: Number, min: [0, 'Amount cannot be negative'] },

  // NEW — reminder flags so a reminder is never sent twice
  reminders: {
    dayBeforeSent: { type: Boolean, default: false },  // evening before
    morningSent: { type: Boolean, default: false },   // 8 AM same-day nudge
    hourSent:    { type: Boolean, default: false },    // 1 hour before
    halfSent:    { type: Boolean, default: false },    // 30 min before (kept for compatibility)
  },

  bookedVia: { type: String, enum: BOOKING_SOURCES, default: 'whatsapp' },
  notes:     { type: String, trim: true },

  cancellation: { cancelledAt: Date, reason: String, by: String },
  rescheduleHistory: [{
    fromDate: String, fromTime: String,
    toDate: String,   toTime: String,
    reason: String,   at: { type: Date, default: Date.now },
  }],
}, { timestamps: true });

appointmentSchema.index({ clinicId: 1, date: 1, time: 1 });
appointmentSchema.index({ patientId: 1 });
appointmentSchema.index({ date: 1, status: 1 });

module.exports = mongoose.models.Appointment || mongoose.model('Appointment', appointmentSchema);
