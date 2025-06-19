const Joi=require('joi');

const updateDoctorStatusSchema=Joi.object({
    status: Joi.string().valid('active', 'blocked', 'pending').required()
});

const updatePatientStatusSchema=Joi.object({
    status: Joi.string().valid('active', 'blocked', 'pending').required()
});


module.exports={updateDoctorStatusSchema, updatePatientStatusSchema}