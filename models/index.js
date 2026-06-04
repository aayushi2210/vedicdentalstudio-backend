// Single place to import every model:
//   const { Patient, Appointment, Invoice } = require('./models');
module.exports = {
  Clinic:          require('./Clinic'),
  Patient:         require('./Patient'),
  Appointment:     require('./Appointment'),
  PackageTemplate: require('./PackageTemplate'),
  Package:         require('./Package'),
  TreatmentPlan:   require('./TreatmentPlan'),
  Session:         require('./Session'),
  Invoice:         require('./Invoice'),
  Feedback:        require('./Feedback'),
};
