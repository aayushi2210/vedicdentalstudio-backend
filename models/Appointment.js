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
  patientName:  { type: String, trim: true },   // denormalised for fast display
  patientPhone: { type: String, match: [PHONE_REGEX, 'Enter a valid phone number'] },
  bookedForName:{ type: String, trim: true },    // when booking for a family member
  therapist:    { type: String, trim: true },

  date: { type: String, required: [true, 'Date is required'],
          match: [DATE_REGEX, 'Date must be in YYYY-MM-DD format'],
          validate: { validator: isValidDateString, message: 'Invalid calendar date' } },
  time: { type: String, required: [true, 'Time is required'],
          match: [TIME_REGEX, 'Time must be in HH:MM (24-hour) format'] },
  durationMinutes: { type: Number, default: 30, min: [5, 'Minimum 5 minutes'] },

  // Free text on the backend (the WhatsApp/AI flow may send any type).
  // The portal dropdown restricts it to APPOINTMENT_TYPES (see validators).
  type:   { type: String, required: [true, 'Appointment type is required'], trim: true },
  status: { type: String, enum: { values: APPOINTMENT_STATUS, message: '{VALUE} is not a valid status' },
            default: 'confirmed' },
  // Lenient on purpose — the WhatsApp flow may send values like 'clinic' (pay at clinic).
  payStatus: { type: String, default: 'pending' },
  amount:    { type: Number, min: [0, 'Amount cannot be negative'] },

  bookedVia: { type: String, enum: BOOKING_SOURCES, default: 'dashboard' },
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

// Cancel an appointment (keeps the record + reason for history)
appointmentSchema.methods.cancel = function (reason = '', by = 'clinic') {
  this.status = 'cancelled';
  this.cancellation = { cancelledAt: new Date(), reason, by };
  return this.save();
};

// Reschedule: logs the old slot, then sets the new one
appointmentSchema.methods.reschedule = function (newDate, newTime, reason = '') {
  this.rescheduleHistory.push({
    fromDate: this.date, fromTime: this.time,
    toDate: newDate,     toTime: newTime, reason,
  });
  this.date = newDate;
  this.time = newTime;
  this.status = 'rescheduled';
  return this.save();
};

module.exports = mongoose.models.Appointment || mongoose.model('Appointment', appointmentSchema);
