const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const {
  getBlockedDoctors,
  getPendingDoctors,
  getAllActiveDoctors,
  getAllPatients,
  updateDoctorStatus,
  getBlockedPatients,
  updateUserStatus,
  adminDashboardStats,
  updateHospitalStatus,
  getPendingHospitals,
  getAllUsers,
  addHospital,
  getAllHospitals,
  updateHospital,
  deleteHospitalImage,
  deleteHospital,
  getAdminAppointments
} = require('../controllers/adminController');

const {getAllAppointments}=require('../controllers/appointmentController')
const validateRequest =require('../middleware/validateReqMiddleware');
const {updateDoctorStatusSchema, updateUserStatusSchema, updateHospitalStatusSchema, addHospitalSchema, updateHospitalSchema, editHospitalSchema}=require('../validations/adminValidation');
const createUploader=require('../middleware/multerMiddleware');

const hospitalUploader = createUploader('hospitals');

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
router.patch('/updateuserstatus/:id', authMiddleware, roleMiddleware(['admin']),validateRequest(updateUserStatusSchema),  updateUserStatus);

router.patch('/updateHospitalstatus/:id', authMiddleware, roleMiddleware(['admin']),validateRequest(updateHospitalStatusSchema),  updateHospitalStatus);

router.get('/appointments', authMiddleware, roleMiddleware(['admin']), getAllAppointments);

router.get('/dashboard-stats', authMiddleware, roleMiddleware(['admin']),adminDashboardStats);

router.get('/pending-hospitals',authMiddleware, roleMiddleware(['admin']), getPendingHospitals)

router.get('/all-users',authMiddleware, roleMiddleware(['admin']), getAllUsers)


router.get('/add-hospital',authMiddleware, roleMiddleware(['admin']), validateRequest(addHospitalSchema), addHospital)

router.get('/hospitals', authMiddleware, roleMiddleware(['admin']),getAllHospitals);


router.post(
  '/upload-hospital-image',
  hospitalUploader.single('image'), // 'image' must match frontend formData key
  (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }

      const fileUrl = `/uploads/hospitals/${req.file.filename}`;
      return res.status(200).json({ url: fileUrl });
    } catch (err) {
      return res.status(500).json({ message: 'Upload failed', error: err.message });
    }
  }
);

router.put('/update-hospital/:id', validateRequest(editHospitalSchema), updateHospital);
router.delete('/delete-hospital-image', deleteHospitalImage);

router.delete(
  '/delete-hospital/:id',
  authMiddleware,
  roleMiddleware(['admin']),
  deleteHospital
);


router.get(
  '/appointment-history',
  authMiddleware,
  roleMiddleware(['admin']),
  getAdminAppointments
);


module.exports = router;
