const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const {
  sendDoctorOtp,
  resendDoctorOtp,
  verifyDoctorOtpAndRegister,
  getDoctorAnalytics,
  doctorAvailability,
  existingDoctorSlots,
  getDoctorDetails,
  updateAppointmentStatus
} = require('../controllers/doctorController');
const {getDoctorAppointments}=require('../controllers/appointmentController');
const { editProfile } = require('../controllers/userController');
const validateRequest = require('../middleware/validateReqMiddleware');
const {
  doctorSchema,
  editDoctorProfileSchema,
  verifyOtpSchema,
  emailOnlySchema
} = require('../validations/doctorValidation');
const createUploader = require('../middleware/multerMiddleware');
const doctorUploader = createUploader('doctor');

const router = express.Router();

// OTP routes (public)
router.post('/send-otp', validateRequest(doctorSchema), sendDoctorOtp);
router.post('/resend-otp', validateRequest(emailOnlySchema), resendDoctorOtp);
router.post('/verify-otp', validateRequest(verifyOtpSchema), verifyDoctorOtpAndRegister);

// Authenticated doctor routes
router.get('/appointments', authMiddleware, roleMiddleware(['doctor']), getDoctorAppointments);
router.put('/edit-profile',
  authMiddleware,
  roleMiddleware(['doctor']),
  doctorUploader.single('profilePicture'),
  validateRequest(editDoctorProfileSchema),
  editProfile
);
router.get('/dashboard/analytics', authMiddleware, roleMiddleware(['doctor']), getDoctorAnalytics);
router.post('/availability', authMiddleware, roleMiddleware(['doctor']), doctorAvailability);
router.get('/availability', authMiddleware, roleMiddleware(['doctor']), existingDoctorSlots);

// PUT before dynamic GET
router.put('/appointments/:id/status', authMiddleware, roleMiddleware(['doctor', 'admin']), updateAppointmentStatus);

// ⚠️ Always last: dynamic route
router.get('/:doctorId', getDoctorDetails);

module.exports = router;
