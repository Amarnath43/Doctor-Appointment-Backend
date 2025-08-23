const express = require('express');
const router = express.Router();

const controller = require('../controllers/admin.reviews.controller');

const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');


/**
 * GET /admin/reviews
 * Query params supported:
 *  - page (1-based) | skip
 *  - limit (1..100)
 *  - qDoctor, qPatient, qHospital
 *  - status (CSV), ratingMin, ratingMax
 *  - hasReply ("true" | "false")
 *  - from, to (ISO dates)
 */
router.get('/', authMiddleware,roleMiddleware(['admin']),controller.listReviews);

/**
 * GET /admin/reviews/stats
 * Same filters as listReviews; returns { count, avg, distribution }
 */
router.get('/stats',authMiddleware, roleMiddleware(['admin']),controller.stats);

/**
 * PATCH /admin/reviews/:id/status
 * Body: { status: "approved" | "pending" | "rejected" }
 */
router.patch('/:id/status', authMiddleware,roleMiddleware(['admin']),controller.updateStatus);

/**
 * DELETE /admin/reviews/:id
 */
router.delete('/:id',authMiddleware, roleMiddleware(['admin']),controller.remove);

module.exports = router;
