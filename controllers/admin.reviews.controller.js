const Review   = require('../models/reviewModel');
const Doctor   = require('../models/doctorModel');
const Hospital = require('../models/hospitalModel');
const User     = require('../models/userModel');

/* --------------------------------- Utils --------------------------------- */

const NAME_MATCH_LIMIT = 500; // cap $in lists for performance

const parseCSV = (s) =>
  (typeof s === 'string' ? s.split(',').map(x => x.trim()).filter(Boolean) : []);

const hasReplyFilter = (val) => {
  if (val === 'true') {
    return { 'doctor_reply.text': { $exists: true, $ne: '' } };
  }
  if (val === 'false') {
    return {
      $or: [
        { 'doctor_reply.text': { $exists: false } },
        { 'doctor_reply.text': '' }
      ]
    };
  }
  return {};
};

// Resolve name → ids (capped)
async function resolveDoctorIdsByName(qDoctor) {
  if (!qDoctor) return null;
  const users = await User.find(
    { name: { $regex: qDoctor, $options: 'i' } },
    { _id: 1 },
    { lean: true, limit: NAME_MATCH_LIMIT }
  );
  const userIds = users.map(u => u._id);
  if (!userIds.length) return [];
  const doctors = await Doctor.find(
    { userId: { $in: userIds } },
    { _id: 1 },
    { lean: true, limit: NAME_MATCH_LIMIT }
  );
  return doctors.map(d => d._id);
}

async function resolvePatientIdsByName(qPatient) {
  if (!qPatient) return null;
  const users = await User.find(
    { name: { $regex: qPatient, $options: 'i' } },
    { _id: 1 },
    { lean: true, limit: NAME_MATCH_LIMIT }
  );
  return users.map(u => u._id);
}

async function resolveHospitalIdsByName(qHospital) {
  if (!qHospital) return null;
  const hospitals = await Hospital.find(
    { name: { $regex: qHospital, $options: 'i' } },
    { _id: 1 },
    { lean: true, limit: NAME_MATCH_LIMIT }
  );
  return hospitals.map(h => h._id);
}

/* ------------------------------- Controllers ------------------------------ */

/**
 * GET /admin/reviews
 * Skip/limit pagination with filters + name search.
 * Query:
 *  - page (1-based) | skip
 *  - limit (1..100)
 *  - qDoctor, qPatient, qHospital (name search)
 *  - status (CSV), ratingMin, ratingMax
 *  - hasReply ("true" | "false")
 *  - from, to (ISO dates)
 */
exports.listReviews = async (req, res) => {
  try {
    const {
      qDoctor,
      qPatient,
      qHospital,
      status,        // CSV: "pending,approved"
      ratingMin,
      ratingMax,
      hasReply,      // "true" | "false"
      from,          // ISO date
      to,            // ISO date
      page,          // 1-based
      limit,         // per page (1..100)
      skip           // optional raw offset (overrides page if provided)
    } = req.query;

    // ---- pagination inputs ----
    const pageSize = Math.min(Math.max(parseInt(limit || '50', 10), 1), 100);
    const rawSkip = skip != null ? Math.max(parseInt(skip, 10) || 0, 0) : null;
    const pageNum = rawSkip != null
      ? Math.floor(rawSkip / pageSize) + 1
      : Math.max(parseInt(page || '1', 10), 1);
    const offset = rawSkip != null ? rawSkip : (pageNum - 1) * pageSize;

    // ---- build filter ----
    const filter = {};

    // status (CSV)
    const statuses = parseCSV(status);
    if (statuses.length) filter.status = { $in: statuses };

    // rating range
    const min = ratingMin != null ? Number(ratingMin) : null;
    const max = ratingMax != null ? Number(ratingMax) : null;
    if (min != null || max != null) {
      filter.rating_overall = {};
      if (min != null) filter.rating_overall.$gte = min;
      if (max != null) filter.rating_overall.$lte = max;
    }

    // has reply
    Object.assign(filter, hasReplyFilter(hasReply));

    // date range
    if (from || to) {
      filter.createdAt = {};
      if (from) {
        const d = new Date(from);
        if (!Number.isNaN(d.getTime())) filter.createdAt.$gte = d;
      }
      if (to) {
        const d = new Date(to);
        if (!Number.isNaN(d.getTime())) filter.createdAt.$lte = d;
      }
      if (!Object.keys(filter.createdAt).length) delete filter.createdAt;
    }

    // ---- name search → resolve ids (capped) ----
    const [doctorIds, patientIds, hospitalIds] = await Promise.all([
      resolveDoctorIdsByName(qDoctor),
      resolvePatientIdsByName(qPatient),
      resolveHospitalIdsByName(qHospital),
    ]);

    // Fast-fail if a name resolver returned "no matches"
    const emptyPage = () => res.json({
      items: [],
      page: pageNum,
      pageSize,
      total: 0,
      totalPages: 0,
      hasNextPage: false,
      hasPrevPage: pageNum > 1,
      nextPage: null,
      prevPage: pageNum > 1 ? pageNum - 1 : null
    });

    if (doctorIds && doctorIds.length === 0) return emptyPage();
    if (patientIds && patientIds.length === 0) return emptyPage();
    if (hospitalIds && hospitalIds.length === 0) return emptyPage();

    if (Array.isArray(doctorIds))   filter.doctorId   = { $in: doctorIds };
    if (Array.isArray(patientIds))  filter.patientId  = { $in: patientIds };
    if (Array.isArray(hospitalIds)) filter.hospitalId = { $in: hospitalIds };

    // ---- query with skip/limit ----
    const sort = { createdAt: -1, _id: -1 };

    const [items, total] = await Promise.all([
      Review.find(filter)
        .sort(sort)
        .skip(offset)
        .limit(pageSize)
        .populate([
          {
            path: 'doctorId',
            select: 'specialization userId',
            populate: { path: 'userId', select: 'name profilePicture' }
          },
          { path: 'patientId',  select: 'name profilePicture' },
          { path: 'hospitalId', select: 'name location' },
        ])
        .lean({ getters: false, virtuals: false }),

      Review.countDocuments(filter)
    ]);

    const totalPages = total ? Math.ceil(total / pageSize) : 0;
    const hasNextPage = offset + items.length < total;
    const hasPrevPage = pageNum > 1;

    res.json({
      items,
      page: pageNum,
      pageSize,
      total,
      totalPages,
      hasNextPage,
      hasPrevPage,
      nextPage: hasNextPage ? pageNum + 1 : null,
      prevPage: hasPrevPage ? pageNum - 1 : null
    });
  } catch (err) {
    console.error('[admin.reviews.list(skip/limit)] error:', err);
    res.status(500).json({ message: 'Failed to fetch reviews' });
  }
};

/**
 * PATCH /admin/reviews/:id/status
 * Body: { status: "approved" | "pending" | "rejected" }
 */
exports.updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const allowed = ['approved', 'pending', 'rejected'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }
    const review = await Review.findByIdAndUpdate(
      id,
      { $set: { status } },
      { new: true }
    ).lean();
    if (!review) return res.status(404).json({ message: 'Review not found' });
    res.json({ message: 'Status updated', review });
  } catch (err) {
    console.error('[admin.reviews.updateStatus] error:', err);
    res.status(500).json({ message: 'Failed to update status' });
  }
};

/**
 * DELETE /admin/reviews/:id
 * Hard delete; switch to soft delete if you add deletedAt/deletedBy fields.
 */
exports.remove = async (req, res) => {
  try {
    const { id } = req.params;
    const r = await Review.findByIdAndDelete(id).lean();
    if (!r) return res.status(404).json({ message: 'Review not found' });
    res.json({ message: 'Review deleted' });
  } catch (err) {
    console.error('[admin.reviews.remove] error:', err);
    res.status(500).json({ message: 'Failed to delete review' });
  }
};

/**
 * GET /admin/reviews/stats
 * Returns { count, avg, distribution } for current filters (no pagination).
 * Accepts the same filters as listReviews (qDoctor, qPatient, qHospital, status, ratingMin, ratingMax, hasReply, from, to).
 */
exports.stats = async (req, res) => {
  try {
    const {
      qDoctor, qPatient, qHospital,
      status, ratingMin, ratingMax,
      hasReply, from, to
    } = req.query;

    const filter = {};

    const statuses = parseCSV(status);
    if (statuses.length) filter.status = { $in: statuses };

    const min = ratingMin != null ? Number(ratingMin) : null;
    const max = ratingMax != null ? Number(ratingMax) : null;
    if (min != null || max != null) {
      filter.rating_overall = {};
      if (min != null) filter.rating_overall.$gte = min;
      if (max != null) filter.rating_overall.$lte = max;
    }

    Object.assign(filter, hasReplyFilter(hasReply));

    if (from || to) {
      filter.createdAt = {};
      if (from) {
        const d = new Date(from);
        if (!Number.isNaN(d.getTime())) filter.createdAt.$gte = d;
      }
      if (to) {
        const d = new Date(to);
        if (!Number.isNaN(d.getTime())) filter.createdAt.$lte = d;
      }
      if (!Object.keys(filter.createdAt).length) delete filter.createdAt;
    }

    // Resolve names → IDs
    const [doctorIds, patientIds, hospitalIds] = await Promise.all([
      resolveDoctorIdsByName(qDoctor),
      resolvePatientIdsByName(qPatient),
      resolveHospitalIdsByName(qHospital),
    ]);

    // Short-circuit no-match cases
    const empty = { count: 0, avg: 0, distribution: {1:0,2:0,3:0,4:0,5:0} };
    if (doctorIds && doctorIds.length === 0) return res.json(empty);
    if (patientIds && patientIds.length === 0) return res.json(empty);
    if (hospitalIds && hospitalIds.length === 0) return res.json(empty);

    if (Array.isArray(doctorIds))   filter.doctorId   = { $in: doctorIds };
    if (Array.isArray(patientIds))  filter.patientId  = { $in: patientIds };
    if (Array.isArray(hospitalIds)) filter.hospitalId = { $in: hospitalIds };

    const pipeline = [
      { $match: filter },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          avg:   { $avg: '$rating_overall' },
          s1:    { $sum: { $cond: [{ $eq: ['$rating_overall', 1] }, 1, 0] } },
          s2:    { $sum: { $cond: [{ $eq: ['$rating_overall', 2] }, 1, 0] } },
          s3:    { $sum: { $cond: [{ $eq: ['$rating_overall', 3] }, 1, 0] } },
          s4:    { $sum: { $cond: [{ $eq: ['$rating_overall', 4] }, 1, 0] } },
          s5:    { $sum: { $cond: [{ $eq: ['$rating_overall', 5] }, 1, 0] } },
        }
      },
      {
        $project: {
          _id: 0,
          count: 1,
          avg: { $ifNull: ['$avg', 0] },
          distribution: {
            '1': '$s1', '2': '$s2', '3': '$s3', '4': '$s4', '5': '$s5'
          }
        }
      }
    ];

    const [row] = await Review.aggregate(pipeline).allowDiskUse(true);
    res.json(row || empty);
  } catch (err) {
    console.error('[admin.reviews.stats] error:', err);
    res.status(500).json({ message: 'Failed to fetch stats' });
  }
};
