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

const editUserProfileSchema=Joi.object({
    name: Joi.string().min(3).max(20).required(),
    email:Joi.string().email().required(),
    phone: Joi.string().pattern(/^[6-9]{1}[0-9]{9}$/).required(),

    dob: Joi.date().iso().optional(),
    gender: Joi.string().valid('male','female', 'other').optional(),
    bloodGroup: Joi.string().valid('A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-').optional(),
    address: Joi.string().min(5).max(100).optional()
})

module.exports = { registerUserSchema, loginUserSchema,editUserProfileSchema };