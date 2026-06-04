// ─────────────────────────────────────────────────────────────
// Shared validation rules — used inside all Mongoose schemas.
// (A mirror copy for the React portal is in validators.frontend.js)
// ─────────────────────────────────────────────────────────────

const PHONE_REGEX = /^(?:\+?91[\s-]?)?[6-9]\d{9}$/;   // Indian mobile, optional 91 / +91
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;     // basic email
const DATE_REGEX  = /^\d{4}-\d{2}-\d{2}$/;            // YYYY-MM-DD
const TIME_REGEX  = /^([01]\d|2[0-3]):[0-5]\d$/;      // 24-hour HH:MM
const NAME_REGEX  = /^[A-Za-z][A-Za-z\s.'-]{1,59}$/;  // letters/spaces, 2-60 chars

const APPOINTMENT_TYPES  = ['Initial Assessment','Follow-up','Walk-in Consultation','Review','Physiotherapy Session','Tele-consultation','Home Visit'];
const APPOINTMENT_STATUS = ['scheduled','confirmed','completed','cancelled','rescheduled','no_show'];
const PAY_STATUS         = ['pending','partial','paid','refunded'];
const PAYMENT_METHODS    = ['cash','upi','card','net_banking','insurance','other'];
const GENDERS            = ['male','female','other'];
const BOOKING_SOURCES    = ['portal','whatsapp','dashboard','walk_in'];

// Is "YYYY-MM-DD" a real calendar date?
function isValidDateString(v) {
  if (!v) return true;                 // optional fields pass when empty
  if (!DATE_REGEX.test(v)) return false;
  const d = new Date(v + 'T00:00:00');
  return !isNaN(d.getTime());
}

// Is the date today or in the future? (use for NEW bookings)
function isNotPastDate(v) {
  if (!isValidDateString(v)) return false;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return new Date(v + 'T00:00:00') >= today;
}

module.exports = {
  PHONE_REGEX, EMAIL_REGEX, DATE_REGEX, TIME_REGEX, NAME_REGEX,
  APPOINTMENT_TYPES, APPOINTMENT_STATUS, PAY_STATUS, PAYMENT_METHODS,
  GENDERS, BOOKING_SOURCES, isValidDateString, isNotPastDate,
};
