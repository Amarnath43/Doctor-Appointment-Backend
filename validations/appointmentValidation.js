const Joi=require('joi');

const appointmentSchema= Joi.object({
    doctorId: Joi.string().required(),
    date: Joi.date().iso().required(),
    slot: Joi.string().required(),
    

});

const rescheduleAppointmentSchema=Joi.object(
    {
        date: Joi.date().iso().required(),
        slot: Joi.string().required()

    }
)

module.exports = { appointmentSchema, rescheduleAppointmentSchema };