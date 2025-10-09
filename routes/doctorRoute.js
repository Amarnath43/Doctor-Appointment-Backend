const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const {
  registerDoctor,
  resendDoctorOtp,
  verifyDoctorOtpAndRegister,
  getDoctorAnalytics,
  doctorAvailability,
  getDoctorAvailability,
  getDoctorDetails,
  updateAppointmentStatus,
  getDoctorDashboardSummary,
  getTodayAppointments,
  listMyDoctorReviews
} = require('../controllers/doctorController');
const { getProfile } = require('../controllers/userController');
const {getDoctorAppointments}=require('../controllers/appointmentController');
const { editProfile } = require('../controllers/userController');
const validateRequest = require('../middleware/validateReqMiddleware');
const {
  doctorSchema,
  editDoctorProfileSchema,
  verifyOtpSchema,
  emailOnlySchema
} = require('../validations/doctorValidation');

const router = express.Router();

// OTP routes (public)
router.post('/send-otp', validateRequest(doctorSchema), registerDoctor);
router.post('/resend-otp', validateRequest(emailOnlySchema), resendDoctorOtp);
router.post('/verify-otp', validateRequest(verifyOtpSchema), verifyDoctorOtpAndRegister);

// Authenticated doctor routes
router.get('/appointments', authMiddleware, roleMiddleware(['doctor']), getDoctorAppointments);
router.put('/edit-profile',
  authMiddleware,
  roleMiddleware(['doctor']),
  validateRequest(editDoctorProfileSchema),
  editProfile
);
router.get('/dashboard/analytics', authMiddleware, roleMiddleware(['doctor']), getDoctorAnalytics);
router.post('/availability', authMiddleware, roleMiddleware(['doctor']), doctorAvailability);
router.get('/availability', authMiddleware, roleMiddleware(['doctor']),getDoctorAvailability);

// PUT before dynamic GET
router.put('/appointments/:id/status', authMiddleware, roleMiddleware(['doctor', 'admin']), updateAppointmentStatus);



router.get('/dashboard-summary', authMiddleware, roleMiddleware(['doctor']), getDoctorDashboardSummary);
router.get('/today-appointments', authMiddleware, roleMiddleware(['doctor']), getTodayAppointments);

router.get(
  '/reviews',
  authMiddleware,
  roleMiddleware(['doctor']),
  listMyDoctorReviews
);

router.get('/profile',authMiddleware, roleMiddleware(['doctor']), getProfile)
// ⚠️ Always last: dynamic route
router.get('/:doctorId', getDoctorDetails);
module.exports = router;
