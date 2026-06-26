const mongoose = require('mongoose');
const { PHONE_REGEX } = require('./validators');
const { ObjectId } = mongoose.Schema.Types;

const feedbackSchema = new mongoose.Schema({
  clinicId:      { type: ObjectId, ref: 'Clinic' },
  patientId:     { type: ObjectId, ref: 'Patient', required: [true, 'patientId is required'] },
  patientName:   { type: String, trim: true },
  patientPhone:  { type: String, match: [PHONE_REGEX, 'Enter a valid phone number'] },
  appointmentId: { type: ObjectId, ref: 'Appointment' },
  therapist:     { type: String, trim: true },
  rating:        { type: Number, required: [true, 'Rating is required'],
                   min: [1, 'Rating must be 1-5'], max: [5, 'Rating must be 1-5'] },
  comment:       { type: String, trim: true, maxlength: [1000, 'Comment too long'] },
  wouldRecommend:{ type: Boolean },
  source:        { type: String, enum: ['portal', 'whatsapp', 'dashboard'], default: 'portal' },
}, { timestamps: true });

module.exports = mongoose.models.Feedback || mongoose.model('Feedback', feedbackSchema);
