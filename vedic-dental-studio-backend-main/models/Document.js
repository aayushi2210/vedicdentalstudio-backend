const mongoose = require('mongoose');
const { PHONE_REGEX } = require('./validators');
const { ObjectId } = mongoose.Schema.Types;

// SECURITY NOTE (#13 "z-security"):
// We never store a public/openly-accessible URL here. Files live on Cloudinary
// with delivery type 'authenticated'. The dashboard fetches a short-lived signed
// URL on demand via /api/documents/:id/url. Without the signature + secret the
// file cannot be opened, so x-rays / prescriptions / images cannot leak.
const documentSchema = new mongoose.Schema({
  clinicId:     { type: ObjectId, ref: 'Clinic' },
  patientId:    { type: ObjectId, ref: 'Patient', required: [true, 'patientId is required'] },
  patientName:  { type: String, trim: true },
  patientPhone: { type: String, match: [PHONE_REGEX, 'Enter a valid phone number'] },

  kind:     { type: String, enum: ['xray', 'prescription', 'image', 'report', 'other'], default: 'image' },
  caption:  { type: String, trim: true },

  // Cloudinary references (NOT a public link)
  publicId:     { type: String, required: true },   // e.g. vedic/patients/<id>/<file>
  resourceType: { type: String, enum: ['image', 'raw', 'video'], default: 'image' },
  format:       { type: String, trim: true },        // jpg / png / pdf ...
  bytes:        { type: Number },

  uploadedVia:  { type: String, enum: ['whatsapp', 'dashboard'], default: 'whatsapp' },
}, { timestamps: true });

documentSchema.index({ patientId: 1, createdAt: -1 });

module.exports = mongoose.models.Document || mongoose.model('Document', documentSchema);
