const mongoose = require('mongoose');
const { PHONE_REGEX, EMAIL_REGEX, GENDERS, BOOKING_SOURCES, isValidDateString } = require('./validators');
const { ObjectId } = mongoose.Schema.Types;

const patientSchema = new mongoose.Schema({
  clinicId: { type: ObjectId, ref: 'Clinic' },
  name:  { type: String, required: [true, 'Patient name is required'], trim: true,
           minlength: [2, 'Name too short'], maxlength: [60, 'Name too long'] },
  phone: { type: String, required: [true, 'Phone is required'], unique: true, trim: true,
           match: [PHONE_REGEX, 'Enter a valid 10-digit Indian mobile number'] },
  email: { type: String, lowercase: true, trim: true,
           match: [EMAIL_REGEX, 'Enter a valid email address'] },
  gender:{ type: String, enum: { values: GENDERS, message: '{VALUE} is not a valid gender' } },
  dob:   { type: String, validate: { validator: isValidDateString, message: 'DOB must be a valid date (YYYY-MM-DD)' } },
  condition: { type: String, trim: true },
  address:   { type: String, trim: true },

  // NEW — language preference for the WhatsApp bot ('hi' Hindi / 'en' English)
  language:  { type: String, enum: ['hi', 'en'], default: 'en' },
  // NEW — true once the patient has shared name + email + address while booking
  profileComplete: { type: Boolean, default: false },

  emergencyContact: {
    name:  { type: String, trim: true },
    phone: { type: String, match: [PHONE_REGEX, 'Enter a valid emergency contact number'] },
  },
  medicalHistory: [String],
  notes:     { type: String, trim: true },
  treatment: { type: String, trim: true },
  source:    { type: String, enum: BOOKING_SOURCES, default: 'whatsapp' },
  isActive:  { type: Boolean, default: true },
}, { timestamps: true });

patientSchema.index({ clinicId: 1, phone: 1 });

module.exports = mongoose.models.Patient || mongoose.model('Patient', patientSchema);
