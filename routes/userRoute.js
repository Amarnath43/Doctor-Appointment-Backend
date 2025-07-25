const express=require('express');
const router=express.Router();
const {registerUser,signin, searchDoctors,editProfile, allHospitals, allSpecializations, finddoctorsByHospital, appointmentHistory, createAdmin}=require('../controllers/userController')
const {myAppointments}=require('../controllers/appointmentController')
const authMiddleware=require('../middleware/authMiddleware');
const roleMiddleware=require('../middleware/roleMiddleware');
const validateRequest=require('../middleware/validateReqMiddleware');
const  { registerUserSchema, loginUserSchema,editUserProfileSchema } =require('../validations/userAuthValidation');
const createUploader=require('../middleware/multerMiddleware')
const profileUploader = createUploader('profile');
const verifyAdminSecret=require('../middleware/verifyAdminSecret')

router.post('/register',validateRequest(registerUserSchema), registerUser);
router.post('/signin', validateRequest(loginUserSchema),signin);
router.put('/edit-profile',authMiddleware,roleMiddleware(['user']),profileUploader.single('profilePicture'), validateRequest(editUserProfileSchema),editProfile);

router.get('/myappointments',authMiddleware, roleMiddleware(['user']), myAppointments);

router.get('/search-doctors', searchDoctors );

router.get('/allhospitals',allHospitals);

router.get('/all-specializations', allSpecializations);

router.get('/hospitals',finddoctorsByHospital);

router.get('/appointments',authMiddleware, roleMiddleware(['user']),appointmentHistory)

router.post('/create-admin', verifyAdminSecret, createAdmin);

module.exports=router