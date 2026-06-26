const mongoose = require('mongoose');
const { PHONE_REGEX, PAY_STATUS, PAYMENT_METHODS } = require('./validators');
const { ObjectId } = mongoose.Schema.Types;

const invoiceItemSchema = new mongoose.Schema({
  description: { type: String, required: [true, 'Item description is required'], trim: true },
  quantity:    { type: Number, default: 1, min: [1, 'Quantity must be at least 1'] },
  unitPrice:   { type: Number, required: [true, 'Unit price is required'], min: [0, 'Cannot be negative'] },
  amount:      { type: Number, min: 0 },
}, { _id: false });

const invoiceSchema = new mongoose.Schema({
  clinicId:      { type: ObjectId, ref: 'Clinic' },
  invoiceNumber: { type: String, unique: true },
  patientId:     { type: ObjectId, ref: 'Patient', required: [true, 'patientId is required'] },
  patientName:   { type: String, trim: true },
  patientPhone:  { type: String, match: [PHONE_REGEX, 'Enter a valid phone number'] },
  patientEmail:  { type: String, lowercase: true, trim: true },
  appointmentId: { type: ObjectId, ref: 'Appointment' },
  packageId:     { type: ObjectId, ref: 'Package' },
  items:         { type: [invoiceItemSchema], validate: [a => a.length > 0, 'At least one line item is required'] },
  subtotal:      { type: Number, min: 0, default: 0 },
  discount:      { type: Number, min: [0, 'Discount cannot be negative'], default: 0 },
  tax:           { type: Number, min: 0, default: 0 },
  totalAmount:   { type: Number, min: 0, default: 0 },
  amountPaid:    { type: Number, min: [0, 'Cannot be negative'], default: 0 },
  status:        { type: String, enum: PAY_STATUS, default: 'pending' },
  paymentMethod: { type: String, enum: PAYMENT_METHODS, default: 'cash' },   // pay-at-clinic
  paidAt:        { type: Date },
  emailedAt:     { type: Date },   // NEW — when the invoice email was sent to the patient
}, { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });

invoiceSchema.virtual('balance').get(function () {
  return Math.max(0, (this.totalAmount || 0) - (this.amountPaid || 0));
});

invoiceSchema.pre('save', async function (next) {
  this.items.forEach(it => { it.amount = (it.quantity || 1) * (it.unitPrice || 0); });
  this.subtotal    = this.items.reduce((s, it) => s + it.amount, 0);
  this.totalAmount = Math.max(0, this.subtotal - this.discount + this.tax);

  if (this.amountPaid <= 0)                     this.status = 'pending';
  else if (this.amountPaid < this.totalAmount)  this.status = 'partial';
  else                                          this.status = 'paid';

  if (this.isNew && !this.invoiceNumber) {
    const count = await this.constructor.countDocuments();
    this.invoiceNumber = `INV-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;
  }
  next();
});

module.exports = mongoose.models.Invoice || mongoose.model('Invoice', invoiceSchema);
