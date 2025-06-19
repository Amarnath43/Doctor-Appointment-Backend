const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const {
  getBlockedDoctors,
  getPendingDoctors,
  getAllActiveDoctors,
  getAllPatients,
  updateDoctorStatus,
  getBlockedPatients,
  updatePatientStatus,
  adminDashboardStats
} = require('../controllers/adminController');

const {getAllAppointments}=require('../controllers/appointmentController')
const validateRequest =require('../middleware/validateReqMiddleware');
const {updateDoctorStatusSchema, updatePatientStatusSchema}=require('../validations/adminValidation')

const express = require('express');
const router = express.Router();

// Pending doctors route
router.get('/pendingdoctors', authMiddleware, roleMiddleware(['admin']), getPendingDoctors);

// Approved doctors route
router.get('/activedoctors', authMiddleware, roleMiddleware(['admin']), getAllActiveDoctors);

// All patients (active)
router.get('/allpatients', authMiddleware, roleMiddleware(['admin']), getAllPatients);

// Update doctor status (approve/reject/block)
router.patch('/updatedoctorstatus/:id', authMiddleware, roleMiddleware(['admin']),validateRequest(updateDoctorStatusSchema), updateDoctorStatus);

// Blocked doctors
router.get('/blockeddoctors', authMiddleware, roleMiddleware(['admin']), getBlockedDoctors);

// Blocked patients
router.get('/blockedpatients', authMiddleware, roleMiddleware(['admin']), getBlockedPatients);

// Update patient status (approve/reject/block)
router.patch('/updatepatientstatus/:id', authMiddleware, roleMiddleware(['admin']),validateRequest(updatePatientStatusSchema),  updatePatientStatus);


router.get('/appointments', authMiddleware, roleMiddleware(['admin']), getAllAppointments);

router.get('/dashboard-stats', authMiddleware, roleMiddleware(['admin']),adminDashboardStats)

module.exports = router;
