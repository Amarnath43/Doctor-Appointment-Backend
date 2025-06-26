const express=require('express');
const router=express.Router();
const {registerUser,signin, searchDoctors,editProfile, allHospitals}=require('../controllers/userController')
const {myAppointments}=require('../controllers/appointmentController')
const authMiddleware=require('../middleware/authMiddleware');
const roleMiddleware=require('../middleware/roleMiddleware');
const validateRequest=require('../middleware/validateReqMiddleware');
const  { registerUserSchema, loginUserSchema,editUserProfileSchema } =require('../validations/userAuthValidation');
const upload=require('../middleware/multerMiddleware');


router.post('/register',validateRequest(registerUserSchema), registerUser);
router.post('/signin', validateRequest(loginUserSchema),signin);
router.patch('/edit-profile/user',authMiddleware,roleMiddleware(['user']),upload.single('avatar'), validateRequest(editUserProfileSchema),editProfile);

router.get('/myappointments',authMiddleware, roleMiddleware(['user']), myAppointments);

router.get('/search-doctors', searchDoctors );

router.get('/allhospitals',allHospitals)


module.exports=router