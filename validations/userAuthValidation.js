const Joi=require('joi');

const registerUserSchema=Joi.object({
    name: Joi.string().min(3).max(20).required(),
    email:Joi.string().email().required(),
    phone: Joi.string().pattern(/^[6-9]{1}[0-9]{9}$/).required(),
    password: Joi.string().min(3).required()
});


const loginUserSchema=Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(3).required()
});

const editUserProfileSchema = Joi.object({
  name: Joi.string().trim().min(3).max(20).required(),
  email: Joi.string().email(),
  phone: Joi.string().pattern(/^[6-9]{1}[0-9]{9}$/),
  dob: Joi.date().iso().optional(),
  gender: Joi.string().valid('Male', 'Female', 'Other').optional(),
  bloodGroup: Joi.string().valid('A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-').optional(),
  address: Joi.string().trim().min(5).max(100).optional(),
  profilePicture: Joi.string().optional(),
  changePassword:Joi.boolean().optional(),
  oldPassword: Joi.string().min(6).max(100),
  newPassword: Joi.string().min(6).max(100)
})

module.exports = { registerUserSchema, loginUserSchema,editUserProfileSchema };