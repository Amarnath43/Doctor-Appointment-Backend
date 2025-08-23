const express = require('express');
const router = express.Router();
const validate = require('../middleware/validateReqMiddleware');
const v = require('../validations/reviewValidation');
const c = require('../controllers/reviewController');

const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');

// ---------- PATIENT ----------
router.post(
  '/reviews',
  authMiddleware,
  roleMiddleware(['user']),
  validate(v.createReviewBody),   // body schema
  c.createReview
);

router.patch(
  '/reviews/:id',
  authMiddleware,
  roleMiddleware(['user']),
  validate(v.editReviewBody),     // body schema
  c.editReviewByUser
);

// ---------- PUBLIC LISTS (NO body validation) ----------
router.get('/reviews/:id', c.getReviewById);
router.get('/doctors/:doctorId/reviews', c.listDoctorReviews);
router.get('/hospitals/:hospitalId/reviews', c.listHospitalReviews);



// ---------- DOCTOR REPLIES ----------
router.post(
  '/reviews/:id/reply',
  authMiddleware,
  roleMiddleware(['doctor']),
  validate(v.doctorReplyBody),        // body schema
  c.replyAsDoctor
);

router.patch(
  '/reviews/:id/reply',
  authMiddleware,
  roleMiddleware(['doctor']),
  validate(v.doctorEditReplyBody),    // body schema
  c.editDoctorReply
);

module.exports = router;
