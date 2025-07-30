const Joi=require('joi');

/*const availabilitySchema=Joi.object({
            date: Joi.date().iso().required(),
            slots: Joi.array().items(
                Joi.string()
            )
        }
        )
        */ 


const emailOnlySchema = Joi.object({
  email: Joi.string().email().required()
});

const verifyOtpSchema = Joi.object({
  email: Joi.string().email().required(),
  otp: Joi.string().length(6).required()
});
    

const doctorSchema=Joi.object({
    name: Joi.string().min(3).max(20).required(),
    email:Joi.string().email().required(),
    phone: Joi.string().pattern(/^[6-9]{1}[0-9]{9}$/).required(),
    password: Joi.string().min(3).required(),
    specialization: Joi.string().min(3).max(50).required(),
    experience: Joi.number().min(0).max(60).required(),
    hospitalName: Joi.string().min(3).max(50).required(),
    location: Joi.string().allow('',null).max(100),
    googleMapsLink: Joi.string().uri().allow('',null),
    hospitalPhoneNumber: Joi.string().pattern(/^[6-9]{1}[0-9]{9}$/).allow('',null),
    fee: Joi.number().min(100).max(10000).required(),
    bio: Joi.string().min(10).max(300).required(),
    //availability: Joi.array().items(availabilitySchema),

});

const editDoctorProfileSchema=Joi.object({
name: Joi.string().min(3).max(20).required(),
    email:Joi.string().email(),
    phone: Joi.string().pattern(/^[6-9]{1}[0-9]{9}$/),
    specialization: Joi.string().min(3).max(50).required(),
    experience: Joi.number().min(0).max(60).required(),
    hospitalName: Joi.string().min(3).max(50).required(),
    fee: Joi.number().min(100).max(10000).required(),
    bio: Joi.string().min(10).max(300).required(),
});




module.exports={emailOnlySchema,verifyOtpSchema,doctorSchema,editDoctorProfileSchema}