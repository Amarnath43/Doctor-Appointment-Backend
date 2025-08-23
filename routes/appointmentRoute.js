const express=require('express');
const router=express.Router();
const  { bookAppointment,cancelAppointment, myAppointments,getDoctorAppointments, getAppointmentDetails, rescheduleAppointment}=require('../controllers/appointmentController');
const authMiddleware=require('../middleware/authMiddleware');
const roleMiddleware=require('../middleware/roleMiddleware');
const validateRequest=require('../middleware/validateReqMiddleware');

const { appointmentSchema }=require('../validations/appointmentValidation')

router.post('/book',authMiddleware, roleMiddleware(['user', 'doctor']), validateRequest(appointmentSchema),bookAppointment );
router.patch('/cancel/:id', authMiddleware, roleMiddleware(['user', 'doctor','admin']), cancelAppointment );

router.get('/:id', authMiddleware, roleMiddleware(['user', 'doctor','admin']),getAppointmentDetails);
router.post('/reschedule/:id',authMiddleware, roleMiddleware(['user', 'doctor','admin']), rescheduleAppointment)


module.exports=router