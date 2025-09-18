const mongoose = require('mongoose');
const {
  Types: { ObjectId },
} = mongoose;
const Review = require('../models/reviewModel');
const Doctor = require('../models/doctorModel');
const Hospital = require('../models/hospitalModel'); //
const Appointment = require('../models/appointmentModel');
const {recomputeDoctorRatings}=require('../utils/recomputeDoctorRatings');
const {recomputeHospitalFromDoctors}=require('../utils/recomputeHospitalFromDoctors')

/* ---------------------------------------------
   POST /reviews  (patient creates review)
--------------------------------------------- */
exports.createReview = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const { appointmentId, text, rating_overall } = req.body;

    const rating = Number(rating_overall);
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return res
        .status(400)
        .json({ message: 'rating_overall must be a number between 1 and 5' });
    }

    await session.withTransaction(async () => {
      const appt = await Appointment.findById(appointmentId)
        .session(session)
        .lean();
      if (!appt) throw { status: 404, message: 'Appointment not found' };

      if (String(appt.userId) !== String(req.user._id)) {
        throw { status: 403, message: 'You can only review your own appointment' };
      }
      if (appt.status !== 'Completed') {
        throw { status: 400, message: 'Only completed appointments can be reviewed' };
      }

      const exists = await Review.findOne({ appointmentId })
        .session(session)
        .lean();
      if (exists) throw { status: 409, message: 'Review already exists for this appointment' };

      if (!appt.doctorId) throw { status: 400, message: 'Appointment missing doctor linkage' };

      const doctor = await Doctor.findById(appt.doctorId)
        .select('_id hospital')
        .session(session)
        .lean();
      if (!doctor) throw { status: 404, message: 'Doctor not found' };

      const docReview = {
        appointmentId,
        doctorId: doctor._id,
        patientId: req.user._id,
        text: typeof text === 'string' ? text : '',
        rating_overall: rating,
        status: 'approved', // or 'pending' if you moderate
      };
      if (doctor.hospital) docReview.hospitalId = doctor.hospital;

      const [created] = await Review.create([docReview], { session });

      // Recompute aggregates atomically with the write
      await recomputeDoctorRatings(doctor._id, session);
      if (doctor.hospital) {
        await recomputeHospitalFromDoctors(doctor.hospital, session);
      }

      res.status(201).json({ id: created._id });
    });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ message: e.message });
    console.error(e);
    return res.status(500).json({ message: 'Server error' });
  } finally {
    session.endSession();
  }
};

/* ---------------------------------------------
   PATCH /reviews/:id  (patient edits own review)
--------------------------------------------- */
exports.editReviewByUser = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const { id } = req.params;
    const { text, rating_overall } = req.body;

    await session.withTransaction(async () => {
      const review = await Review.findById(id).session(session);
      if (!review) throw { status: 404, message: 'Review not found' };

      if (String(review.patientId) !== String(req.user._id)) {
        throw { status: 403, message: 'Not allowed' };
      }

      const hours =
        (Date.now() - new Date(review.createdAt).getTime()) / 36e5;
      if (hours > 24) throw { status: 400, message: 'Edit window closed' };

      if (typeof text === 'string') review.text = text;
      if (typeof rating_overall !== 'undefined') {
        const r = Number(rating_overall);
        if (!Number.isFinite(r) || r < 1 || r > 5) {
          throw { status: 400, message: 'rating_overall must be 1–5' };
        }
        review.rating_overall = r;
      }

      await review.save({ session });

      // Recompute aggregates for doctor (and hospital)
      await recomputeDoctorRatings(review.doctorId, session);

      const doc = await Doctor.findById(review.doctorId)
        .select('hospital')
        .session(session)
        .lean();
      if (doc?.hospital) {
        await recomputeHospitalFromDoctors(doc.hospital, session);
      }

      res.json({ message: 'Review updated' });
    });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ message: e.message });
    console.error(e);
    return res.status(500).json({ message: 'Server error' });
  } finally {
    session.endSession();
  }
};

/* ---------------------------------------------
   DELETE /reviews/:id  (patient deletes own review)
--------------------------------------------- */
exports.deleteReviewByUser = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const { id } = req.params;

    await session.withTransaction(async () => {
      const review = await Review.findById(id).session(session);
      if (!review) throw { status: 404, message: 'Review not found' };

      if (String(review.patientId) !== String(req.user._id)) {
        throw { status: 403, message: 'Not allowed' };
      }

      const doctorId = review.doctorId;
      await review.deleteOne({ session });

      // Recompute aggregates
      await recomputeDoctorRatings(doctorId, session);

      const doc = await Doctor.findById(doctorId)
        .select('hospital')
        .session(session)
        .lean();
      if (doc?.hospital) {
        await recomputeHospitalFromDoctors(doc.hospital, session);
      }

      res.json({ message: 'Review deleted' });
    });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ message: e.message });
    console.error(e);
    return res.status(500).json({ message: 'Server error' });
  } finally {
    session.endSession();
  }
};

/* ---------------------------------------------
   GET /doctors/:doctorId/reviews (public)
--------------------------------------------- */
const { isValidObjectId, Types } = require('mongoose');

exports.listDoctorReviews = async (req, res) => {
  try {
    const { doctorId } = req.params;
    if (!isValidObjectId(doctorId)) {
      return res.status(400).json({ message: 'Invalid doctorId' });
    }

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const [itemsRaw, total, avgAgg] = await Promise.all([
      Review.find({ doctorId, status: 'approved' })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('_id text rating_overall createdAt patientId doctor_reply doctorId')
        .populate({ path: 'patientId', select: 'name profilePicture' })
        .populate({
          path: 'doctorId',
          select: 'userId', // only need userId from Doctor
          populate: { path: 'userId', select: 'name profilePicture' } // fetch name & avatar
        })
        .lean(),
      Review.countDocuments({ doctorId, status: 'approved' }),
      Review.aggregate([
        { $match: { doctorId: new Types.ObjectId(doctorId), status: 'approved' } },
        { $group: { _id: null, avg: { $avg: '$rating_overall' } } },
      ]),
    ]);

    const items = itemsRaw.map(r => ({
      _id: r._id,
      rating: r.rating_overall,
      comment: r.text,
      createdAt: r.createdAt,
      user: {
        name: r.patientId?.name || 'Patient',
        profilePicture: r.patientId?.profilePicture,
      },
      doctor: {
        name: r.doctorId?.userId?.name || null,
        profilePicture: r.doctorId?.userId?.profilePicture || null,
      },
      doctor_reply: r.doctor_reply,
    }));

    const avgRating = Number((avgAgg[0]?.avg || 0).toFixed(1));
    return res.json({ items, total, page, limit, avgRating });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Server error' });
  }
};


/* ---------------------------------------------
   GET /hospitals/:hospitalId/reviews (public)
--------------------------------------------- */
exports.listHospitalReviews = async (req, res) => {
  try {
    const { hospitalId } = req.params;

    const pageRaw = Number(req.query.page);
    const limitRaw = Number(req.query.limit);
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
    const limit = Number.isFinite(limitRaw)
      ? Math.min(50, Math.max(1, limitRaw))
      : 20;
    const skip = (page - 1) * limit;

    // The total count is now fetched directly from the Review collection, as requested.
    const [itemsRaw, total] = await Promise.all([
      Review.find({ hospitalId, status: 'approved' })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select(
          '_id text rating_overall createdAt patientId doctor_reply doctorId'
        )
        .populate({ path: 'patientId', select: 'name profilePicture' })
        .populate({
          path: 'doctorId',
          select: 'userId',
          populate: {
            path: 'userId',
            select: 'name profilePicture'
          }
        })
        .lean(),
      Review.countDocuments({ hospitalId, status: 'approved' }),
    ]);

    const items = itemsRaw.map((r) => ({
      _id: r._id,
      rating: r.rating_overall,
      comment: r.text,
      createdAt: r.createdAt,
      user: {
        name: r.patientId?.name || 'Patient',
        profilePicture: r.patientId?.profilePicture,
      },
      doctor: {
        name: r.doctorId?.userId?.name || 'Doctor',
        profilePicture: r.doctorId?.userId?.profilePicture,
      },
      doctor_reply: r.doctor_reply,
    }));

    return res.json({ items, page, limit, total });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Server error' });
  }
};

/* ---------------------------------------------
   POST /reviews/:id/reply (doctor replies)
--------------------------------------------- */
exports.replyAsDoctor = async (req, res) => {
  try {
    const { id } = req.params;
    const { text } = req.body;

    const review = await Review.findById(id);
    if (!review) return res.status(404).json({ message: 'Review not found' });

    if (req.user.role !== 'doctor') {
      return res.status(403).json({ message: 'Not allowed' });
    }

    const me = await Doctor.findOne({ userId: req.user._id })
      .select('_id')
      .lean();
    if (!me || String(review.doctorId) !== String(me._id)) {
      return res.status(403).json({ message: 'Not allowed' });
    }

    if (review.doctor_reply?.repliedAt) {
      return res
        .status(409)
        .json({ message: 'Reply already exists. Use edit reply endpoint.' });
    }

    review.doctor_reply = { text, repliedAt: new Date() };
    await review.save();

    res.json({ message: 'Reply saved' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Server error' });
  }
};

/* ---------------------------------------------
   PATCH /reviews/:id/reply (doctor edits reply)
--------------------------------------------- */
exports.editDoctorReply = async (req, res) => {
  try {
    const { id } = req.params;
    const { text } = req.body;

    const review = await Review.findById(id);
    if (!review) return res.status(404).json({ message: 'Review not found' });

    if (req.user.role !== 'doctor') {
      return res.status(403).json({ message: 'Not allowed' });
    }

    const me = await Doctor.findOne({ userId: req.user._id })
      .select('_id')
      .lean();
    if (!me || String(review.doctorId) !== String(me._id)) {
      return res.status(403).json({ message: 'Not allowed' });
    }

    if (!review.doctor_reply?.repliedAt) {
      return res.status(404).json({ message: 'No existing reply to edit' });
    }

    const hours =
      (Date.now() - new Date(review.doctor_reply.repliedAt).getTime()) / 36e5;
    if (hours > 24) return res.status(400).json({ message: 'Edit window closed' });

    review.doctor_reply.text = text;
    await review.save();
    res.json({ message: 'Reply updated' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Server error' });
  }
};

/* ---------------------------------------------
   GET /reviews/:id
--------------------------------------------- */
exports.getReviewById = async (req, res) => {
  try {
    const { id } = req.params;
    const review = await Review.findById(id).lean();
    if (!review) return res.status(404).json({ message: 'Review not found' });
    return res.json(review);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Server error' });
  }
};
