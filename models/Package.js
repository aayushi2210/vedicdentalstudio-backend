const mongoose = require('mongoose');
const { PHONE_REGEX, PAY_STATUS, isValidDateString } = require('./validators');
const { ObjectId } = mongoose.Schema.Types;

const packageSchema = new mongoose.Schema({
  clinicId:    { type: ObjectId, ref: 'Clinic' },
  templateId:  { type: ObjectId, ref: 'PackageTemplate' },   // which catalog item this came from
  patientId:   { type: ObjectId, ref: 'Patient', required: [true, 'patientId is required'] },
  patientName: { type: String, trim: true },
  patientPhone:{ type: String, match: [PHONE_REGEX, 'Enter a valid phone number'] },
  name:        { type: String, required: [true, 'Package name is required'], trim: true },
  total:       { type: Number, required: [true, 'Total sessions is required'], min: [1, 'At least 1 session'] },
  done:        { type: Number, default: 0, min: [0, 'Cannot be negative'] },
  amount:      { type: Number, min: [0, 'Amount cannot be negative'] },
  payStatus:   { type: String, enum: PAY_STATUS, default: 'pending' },
  paidAt:      { type: Date },
  therapist:   { type: String, trim: true },
  startDate:   { type: String, validate: { validator: isValidDateString, message: 'Start date must be YYYY-MM-DD' } },
  active:      { type: Boolean, default: true },
  renewalNotified: { type: Boolean, default: false },   // renewal reminder already sent
}, { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });

// Sessions left = total - done (never below 0)
packageSchema.virtual('remaining').get(function () {
  return Math.max(0, (this.total || 0) - (this.done || 0));
});

module.exports = mongoose.models.Package || mongoose.model('Package', packageSchema);
