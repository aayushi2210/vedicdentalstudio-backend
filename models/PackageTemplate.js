const mongoose = require('mongoose');
const { ObjectId } = mongoose.Schema.Types;

// The menu of packages a clinic SELLS (e.g. "10-session Knee Rehab – ₹8000").
// A patient who buys one gets a Package record (see Package.js).
const packageTemplateSchema = new mongoose.Schema({
  clinicId:      { type: ObjectId, ref: 'Clinic' },
  name:          { type: String, required: [true, 'Package name is required'], trim: true },
  description:   { type: String, trim: true },
  totalSessions: { type: Number, required: [true, 'Total sessions is required'], min: [1, 'At least 1 session'] },
  price:         { type: Number, required: [true, 'Price is required'], min: [0, 'Price cannot be negative'] },
  validityDays:  { type: Number, default: 90, min: [1, 'Validity must be at least 1 day'] },
  isActive:      { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.models.PackageTemplate || mongoose.model('PackageTemplate', packageTemplateSchema);
