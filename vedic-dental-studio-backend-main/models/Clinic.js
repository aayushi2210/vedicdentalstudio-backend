const mongoose = require('mongoose');
const { PHONE_REGEX, EMAIL_REGEX } = require('./validators');

// Root tenant. Every other record can carry a clinicId so multiple
// clinics share one database without seeing each other's data.
const clinicSchema = new mongoose.Schema({
  name:           { type: String, required: [true, 'Clinic name is required'], trim: true },
  ownerName:      { type: String, trim: true },
  phone:          { type: String, match: [PHONE_REGEX, 'Enter a valid phone number'] },
  email:          { type: String, lowercase: true, trim: true, match: [EMAIL_REGEX, 'Enter a valid email'] },
  whatsappNumber: { type: String, trim: true },
  address:        { type: String, trim: true },
  city:           { type: String, trim: true },
  plan:           { type: String, enum: ['trial', 'basic', 'pro'], default: 'trial' },
  isActive:       { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.models.Clinic || mongoose.model('Clinic', clinicSchema);
