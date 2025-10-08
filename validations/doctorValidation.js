const Joi = require('joi');



const emailOnlySchema = Joi.object({
  email: Joi.string().email().required(),
  isLoginFlow: Joi.boolean().optional()
});

const verifyOtpSchema = Joi.object({
  email: Joi.string().email().required(),
  otp: Joi.string().length(6).required(),
  isLoginFlow: Joi.boolean().optional()
});



const phonePattern = /^[6-9][0-9]{9}$/;

 const doctorSchema = Joi.object({
  name: Joi.string().min(3).max(20).required(),
  email: Joi.string().email().required(),
  phone: Joi.string().pattern(phonePattern).required(),
  password: Joi.string().min(8).required(),

  specialization: Joi.string().min(3).max(50).required(),
  experience: Joi.number().min(0).max(60).required(),

  // IMPORTANT: treat '' and null as empty so conditionals work
  hospitalId: Joi.string()
    .trim()
    .allow('', null)
    .empty(['', null]) // now '' becomes undefined internally
    .optional(),

  // Keep hospitalName required (you likely display it even for picked IDs)
  hospitalName: Joi.string().min(3).max(50).required(),

  // Only required if hospitalId is NOT provided
  location: Joi.alternatives().conditional('hospitalId', {
    is: Joi.exist(), // hospitalId present (not empty/undefined)
    then: Joi.string().allow('', null).max(100),
    otherwise: Joi.string().min(3).max(100).required(),
  }),

  googleMapsLink: Joi.alternatives().conditional('hospitalId', {
    is: Joi.exist(),
    then: Joi.string().uri().allow('', null),
    otherwise: Joi.string().uri().required(),
  }),

  hospitalPhoneNumber: Joi.alternatives().conditional('hospitalId', {
    is: Joi.exist(),
    then: Joi.string().pattern(phonePattern).allow('', null),
    otherwise: Joi.string().pattern(phonePattern).required(),
  }),

  fee: Joi.number().min(100).max(10000).required(),
  bio: Joi.string().min(10).max(300).required(),
});



const editDoctorProfileSchema = Joi.object({
  name: Joi.string().min(3).max(20).required(),
  email: Joi.string().email(),
  phone: Joi.string().pattern(/^[6-9]{1}[0-9]{9}$/),
  specialization: Joi.string().min(3).max(50).required(),
  experience: Joi.number().min(0).max(60).required(),
  fee: Joi.number().min(100).max(10000).required(),
  bio: Joi.string().min(10).max(300).required(),
  profilePicture: Joi.string().optional(),
  changePassword: Joi.boolean().optional(),
  oldPassword: Joi.string().min(6).max(100),
  newPassword: Joi.string().min(6).max(100)

});




module.exports = { emailOnlySchema, verifyOtpSchema, doctorSchema, editDoctorProfileSchema }
