const express=require('express');
const router=express.Router();
const {registerUser,signin, searchDoctors,editProfile, getHospitals,searchHospitals, allSpecializations,  appointmentHistory, createAdmin, resendOTP, verifyOTP, resetPasswordWithOTP, sendPasswordResetOTP}=require('../controllers/userController')
const {myAppointments}=require('../controllers/appointmentController')
const authMiddleware=require('../middleware/authMiddleware');
const roleMiddleware=require('../middleware/roleMiddleware');
const validateRequest=require('../middleware/validateReqMiddleware');
const  { registerUserSchema, loginUserSchema,editUserProfileSchema } =require('../validations/userAuthValidation');
const verifyAdminSecret=require('../middleware/verifyAdminSecret')

router.post('/register',validateRequest(registerUserSchema), registerUser);
router.post('/signin', validateRequest(loginUserSchema),signin);
router.put('/edit-profile',authMiddleware,roleMiddleware(['user']), validateRequest(editUserProfileSchema),editProfile);

router.get('/myappointments',authMiddleware, roleMiddleware(['user']), myAppointments);

router.get('/search-doctors', searchDoctors );

router.get('/hospitals-register',searchHospitals);

router.get('/all-specializations', allSpecializations);

router.get('/hospitals',getHospitals);

router.get('/appointments/history',authMiddleware, roleMiddleware(['user']),appointmentHistory)

router.post('/create-admin', verifyAdminSecret, createAdmin);

router.post('/verify-otp',verifyOTP)

router.post('/resend-otp',resendOTP)

  
router.post('/forgot-password/send-otp',sendPasswordResetOTP)

router.post('/forgot-password/verify', resetPasswordWithOTP)

module.exports=router