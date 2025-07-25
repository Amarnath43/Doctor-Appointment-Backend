const express=require('express');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const {getDoctorAppointments}=require('../controllers/appointmentController');
const {registerDoctor, getDoctorAnalytics, doctorAvailabilty, existingDoctorSlots, getDoctorDetails, updateAppointmentStatus}=require('../controllers/doctorController');
const {editProfile}=require('../controllers/userController')
const validateRequest =require('../middleware/validateReqMiddleware');
const {doctorSchema, editDoctorProfileSchema}=require('../validations/doctorValidation');
const createUploader=require('../middleware/multerMiddleware');
const doctorUploader=createUploader('doctor')
const router=express.Router();



router.post('/register',validateRequest(doctorSchema),registerDoctor)
router.get('/appointments', authMiddleware, roleMiddleware(['doctor']), getDoctorAppointments);

router.put('/edit-profile', authMiddleware, roleMiddleware(['doctor']),doctorUploader.single('profilePicture'),validateRequest(editDoctorProfileSchema),editProfile );
router.get('/dashboard/analytics',authMiddleware, roleMiddleware(['doctor']), getDoctorAnalytics);

router.post('/availability',authMiddleware, roleMiddleware(['doctor']),doctorAvailabilty);
router.get('/availability',authMiddleware, roleMiddleware(['doctor']),existingDoctorSlots)
router.get('/:doctorId',getDoctorDetails);
router.put('/appointments/:id/status', authMiddleware,roleMiddleware(['doctor','admin']), updateAppointmentStatus);
module.exports=router