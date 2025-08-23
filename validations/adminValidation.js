const Joi=require('joi');

const updateDoctorStatusSchema=Joi.object({
    status: Joi.string().valid('active', 'blocked', 'pending').required()
});

const updateUserStatusSchema=Joi.object({
    status: Joi.string().valid('active', 'blocked', 'pending').required()
});

const updateHospitalStatusSchema=Joi.object({
    status: Joi.string().valid('active', 'blocked', 'pending').required()
});

const addHospitalSchema = Joi.object({
  name: Joi.string().trim().required(),
  location: Joi.string().trim().required(),
  googleMapsLink: Joi.string().trim().uri().required(),
  phoneNumber: Joi.string()
    .pattern(/^[6-9]{1}[0-9]{9}$/)
    .message("Phone number must be a valid 10-digit Indian number starting with 6-9")
    .required()
});

const updateHospitalSchema = Joi.object({
  name: Joi.string().trim(),
  location: Joi.string().trim(),
  googleMapsLink: Joi.string().trim().uri(),
  phoneNumber: Joi.string()
    .pattern(/^[6-9]{1}[0-9]{9}$/)
    .message("Phone number must be a valid 10-digit Indian number starting with 6-9"),

  images: Joi.array().items(Joi.string().pattern(/^\/?hospitals?.+$/)).optional(),
  description: Joi.string().trim(),
  createdByDoctor: Joi.boolean(),

  status: Joi.string().valid('pending', 'active', 'blocked'),
  departments: Joi.array().items(Joi.string().trim()),
  facilities: Joi.array().items(Joi.string().trim()),
  timings: Joi.object({
    weekdays: Joi.string().allow('', null),
    weekends: Joi.string().allow('', null)
  })
});

const editHospitalSchema = Joi.object({
  name: Joi.string().trim().min(3).max(100),
  location: Joi.string().trim().min(2).max(100),
  googleMapsLink: Joi.string().uri().trim().allow(''),

  phoneNumber: Joi.string()
    .pattern(/^[6-9]{1}[0-9]{9}$/)
    .message('Phone number must be a valid 10-digit Indian number'),

  description: Joi.string().trim().max(1000).allow(''),

  images: Joi.array().items(Joi.string().pattern(/^\/?hospitals?.+$/)).optional(),


  departments: Joi.array().items(Joi.string().trim().min(1)).optional(),

   availableTests: Joi.array().items(Joi.string().trim().min(1)).optional(),

  facilities: Joi.array().items(Joi.string().trim().min(1)).optional(),

  timings: Joi.object({
    weekdays: Joi.string().allow('', null),
    weekends: Joi.string().allow('', null)
  }).optional(),

  status: Joi.string().valid('active', 'pending', 'blocked').optional()
});



module.exports={updateDoctorStatusSchema, updateUserStatusSchema, updateHospitalStatusSchema, addHospitalSchema, updateHospitalSchema, editHospitalSchema}