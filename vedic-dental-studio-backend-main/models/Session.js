const mongoose = require('mongoose');
const { DATE_REGEX, TIME_REGEX, isValidDateString } = require('./validators');
const { ObjectId } = mongoose.Schema.Types;

const sessionSchema = new mongoose.Schema({
  clinicId:       { type: ObjectId, ref: 'Clinic' },
  packageId:      { type: ObjectId, ref: 'Package' },
  treatmentPlanId:{ type: ObjectId, ref: 'TreatmentPlan' },
  patientId:      { type: ObjectId, ref: 'Patient', required: [true, 'patientId is required'] },
  patientName:    { type: String, trim: true },
  no:             { type: Number, min: 1 },     // session number in the package
  date: { type: String, match: [DATE_REGEX, 'Date must be YYYY-MM-DD'],
          validate: { validator: isValidDateString, message: 'Invalid calendar date' } },
  time: { type: String, match: [TIME_REGEX, 'Time must be HH:MM (24-hour)'] },
  therapist:  { type: String, trim: true },
  treatments: [String],
  notes:      { type: String, trim: true },
}, { timestamps: true });

module.exports = mongoose.models.Session || mongoose.model('Session', sessionSchema);
