const express=require('express');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const {getDoctorAppointments}=require('../controllers/appointmentController');
const {registerDoctor}=require('../controllers/doctorController');
const {editProfile}=require('../controllers/userController')
const validateRequest =require('../middleware/validateReqMiddleware');
const {doctorSchema, editDoctorProfileSchema}=require('../validations/doctorValidation')
const router=express.Router();



router.post('/register',validateRequest(doctorSchema),registerDoctor)
router.get('/appointments', authMiddleware, roleMiddleware(['doctor']), getDoctorAppointments);

router.patch('/edit-profile/doctor', authMiddleware, roleMiddleware(['doctor']),validateRequest(editDoctorProfileSchema), )

module.exports=router