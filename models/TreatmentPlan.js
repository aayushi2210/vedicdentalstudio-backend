const mongoose = require('mongoose');
const { isValidDateString } = require('./validators');
const { ObjectId } = mongoose.Schema.Types;

const exerciseSchema = new mongoose.Schema({
  name:      { type: String, required: [true, 'Exercise name is required'], trim: true },
  sets:      { type: Number, min: 0 },
  reps:      { type: Number, min: 0 },
  frequency: { type: String, trim: true },   // e.g. "2x daily"
  notes:     { type: String, trim: true },
}, { _id: false });

const treatmentPlanSchema = new mongoose.Schema({
  clinicId:  { type: ObjectId, ref: 'Clinic' },
  patientId: { type: ObjectId, ref: 'Patient', required: [true, 'patientId is required'] },
  packageId: { type: ObjectId, ref: 'Package' },     // optional link to a purchased package
  therapist: { type: String, trim: true },
  diagnosis: { type: String, trim: true },
  goals:     [String],
  exercises: [exerciseSchema],
  startDate: { type: String, validate: { validator: isValidDateString, message: 'Start date must be YYYY-MM-DD' } },
  endDate:   { type: String, validate: { validator: isValidDateString, message: 'End date must be YYYY-MM-DD' } },
  status:    { type: String, enum: ['active', 'completed', 'paused', 'cancelled'], default: 'active' },
  notes:     { type: String, trim: true },
}, { timestamps: true });

module.exports = mongoose.models.TreatmentPlan || mongoose.model('TreatmentPlan', treatmentPlanSchema);
