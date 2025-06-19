const Joi=require('joi');

const availabilitySchema=Joi.object({
            date: Joi.date().iso().required(),
            slots: Joi.array().items(
                Joi.string()
            )
        }
        )
    

const doctorSchema=Joi.object({
name: Joi.string().min(3).max(20).required(),
    email:Joi.string().email().required(),
    phone: Joi.string().pattern(/^[6-9]{1}[0-9]{9}$/).required(),
    password: Joi.string().min(3).required(),
    specialization: Joi.string().min(3).max(50).required(),
    experience: Joi.number().min(0).max(60).required(),
    hospitalName: Joi.string().min(3).max(50).required(),
    fee: Joi.number().min(100).max(10000).required(),
    bio: Joi.string().min(10).max(300).required(),
    availability: Joi.array().items(availabilitySchema),
    status: Joi.string().valid('active', 'pending', 'blocked')

});

const editDoctorProfileSchema=Joi.object({
name: Joi.string().min(3).max(20).required(),
    email:Joi.string().email().required(),
    phone: Joi.string().pattern(/^[6-9]{1}[0-9]{9}$/).required(),
    specialization: Joi.string().min(3).max(50).required(),
    experience: Joi.number().min(0).max(60).required(),
    hospitalName: Joi.string().min(3).max(50).required(),
    fee: Joi.number().min(100).max(10000).required(),
    bio: Joi.string().min(10).max(300).required(),
});

module.exports={doctorSchema,editDoctorProfileSchema}