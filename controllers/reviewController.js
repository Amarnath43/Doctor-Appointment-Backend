const mongoose = require('mongoose');
const Review = require('../models/reviewModel');
const Doctor = require('../models/doctorModel');
const Appointment = require('../models/appointmentModel');

// POST /reviews
exports.createReview = async (req, res) => {
  try {
    const { appointmentId, text, rating_overall } = req.body;

    // Validate rating
    const rating = Number(rating_overall);
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'rating_overall must be a number between 1 and 5' });
    }

    const appt = await Appointment.findById(appointmentId).lean();
    if (!appt) return res.status(404).json({ message: 'Appointment not found' });

    // Ownership + completion
    const isMine = String(appt.userId) === String(req.user._id);
    if (!isMine) return res.status(403).json({ message: 'You can only review your own appointment' });
    if (appt.status !== 'Completed') {
      return res.status(400).json({ message: 'Only completed appointments can be reviewed' });
    }

    // One review per appointment
    const exists = await Review.findOne({ appointmentId }).lean();
    if (exists) return res.status(409).json({ message: 'Review already exists for this appointment' });

    // Derive doctor + hospital (Doctor schema has `hospital`)
    if (!appt.doctorId) {
      return res.status(400).json({ message: 'Appointment missing doctor linkage' });
    }

    const doctor = await Doctor.findById(appt.doctorId).select('_id hospital').lean();
    if (!doctor) return res.status(404).json({ message: 'Doctor not found' });

    const reviewData = {
      appointmentId,
      doctorId: doctor._id,
      patientId: req.user._id,
      text: typeof text === 'string' ? text : '',
      rating_overall: rating,
      status: 'approved', // or 'pending' if moderating
    };
    if (doctor.hospital) reviewData.hospitalId = doctor.hospital;

    const review = await Review.create(reviewData);
    return res.status(201).json({ id: review._id });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Server error' });
  }
};

// PATCH /reviews/:id
exports.editReviewByUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { text, rating_overall } = req.body;

    const review = await Review.findById(id);
    if (!review) return res.status(404).json({ message: 'Review not found' });

    if (String(review.patientId) !== String(req.user.id)) {
      return res.status(403).json({ message: 'Not allowed' });
    }

    // 24h window remains
    const hours = (Date.now() - new Date(review.createdAt).getTime()) / 36e5;
    if (hours > 24) return res.status(400).json({ message: 'Edit window closed' });

    if (typeof text === 'string') review.text = text;
    if (typeof rating_overall !== 'undefined') {
      const r = Number(rating_overall);
      if (!Number.isFinite(r) || r < 1 || r > 5) {
        return res.status(400).json({ message: 'rating_overall must be 1–5' });
      }
      review.rating_overall = r;
    }

    // If moderating edits:
    // review.status = 'pending';

    await review.save();
    return res.json({ message: 'Review updated' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Server error' });
  }
};

// GET /doctors/:doctorId/reviews  (public)
exports.listDoctorReviews = async (req, res) => {
  try {
    const { doctorId } = req.params;

    const pageRaw = Number(req.query.page);
    const limitRaw = Number(req.query.limit);
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
    const limit = Number.isFinite(limitRaw) ? Math.min(50, Math.max(1, limitRaw)) : 20;
    const skip = (page - 1) * limit;

    const [itemsRaw, total, avgAgg] = await Promise.all([
      Review.find({ doctorId, status: 'approved' })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('_id text rating_overall createdAt patientId doctor_reply')
        .populate({ path: 'patientId', select: 'name profilePicture' })
        .lean(),
      Review.countDocuments({ doctorId, status: 'approved' }),
      Review.aggregate([
        { $match: { doctorId: new mongoose.Types.ObjectId(doctorId), status: 'approved' } },
        { $group: { _id: null, avg: { $avg: '$rating_overall' } } }
      ])
    ]);

    const items = itemsRaw.map(r => ({
      _id: r._id,
      rating: r.rating_overall,
      comment: r.text,
      createdAt: r.createdAt,
      user: { name: r.patientId?.name || 'Patient',
        profilePicture:r.patientId?.profilePicture
       },
      doctor_reply:r.doctor_reply,
      
    }));

    const avgRating = avgAgg[0]?.avg || 0;

    return res.json({ items, total, page, limit, avgRating });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Server error' });
  }
};

// GET /hospitals/:hospitalId/reviews  (public)
exports.listHospitalReviews = async (req, res) => {
  try {
    const { hospitalId } = req.params;

    const pageRaw = Number(req.query.page);
    const limitRaw = Number(req.query.limit);
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
    const limit = Number.isFinite(limitRaw) ? Math.min(50, Math.max(1, limitRaw)) : 20;
    const skip = (page - 1) * limit;

    const [itemsRaw, total, avgAgg] = await Promise.all([
      Review.find({ hospitalId, status: 'approved' })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('_id text rating_overall createdAt patientId doctor_reply')
        .populate({ path: 'patientId', select: 'name profilePicture' })
        
        .lean(),
      Review.countDocuments({ hospitalId, status: 'approved' }),
      Review.aggregate([
        { $match: { hospitalId: new mongoose.Types.ObjectId(hospitalId), status: 'approved' } },
        { $group: { _id: null, avg: { $avg: '$rating_overall' } } }
      ])
    ]);

    const items = itemsRaw.map(r => ({
      _id: r._id,
      rating: r.rating_overall,
      comment: r.text,
      createdAt: r.createdAt,
      user: { name: r.patientId?.name || 'Patient',
        profilePicture:r.patientId?.profilePicture
       },
      doctor_reply:r.doctor_reply
    }));

    const avgRating = avgAgg[0]?.avg || 0;

    return res.json({ items, total, page, limit, avgRating });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Server error' });
  }
};



// replyAsDoctor
exports.replyAsDoctor = async (req, res) => {
  try {
    const { id } = req.params;
    const { text } = req.body;

    const review = await Review.findById(id);
    if (!review) return res.status(404).json({ message: 'Review not found' });

    if (req.user.role !== 'doctor') {
      return res.status(403).json({ message: 'Not allowed' });
    }

    // derive doctorId from the logged-in doctor user
    const me = await Doctor.findOne({ userId: req.user._id }).select('_id').lean();
    if (!me || String(review.doctorId) !== String(me._id)) {
      return res.status(403).json({ message: 'Not allowed' });
    }

    if (review.doctor_reply?.repliedAt) {
      return res.status(409).json({ message: 'Reply already exists. Use edit reply endpoint.' });
    }

    review.doctor_reply = { text, repliedAt: new Date() };
    await review.save();

    res.json({ message: 'Reply saved' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Server error' });
  }
};

// editDoctorReply
exports.editDoctorReply = async (req, res) => {
  try {
    const { id } = req.params;
    const { text } = req.body;

    const review = await Review.findById(id);
    if (!review) return res.status(404).json({ message: 'Review not found' });

    if (req.user.role !== 'doctor') {
      return res.status(403).json({ message: 'Not allowed' });
    }

    const me = await Doctor.findOne({ userId: req.user._id }).select('_id').lean();
    if (!me || String(review.doctorId) !== String(me._id)) {
      return res.status(403).json({ message: 'Not allowed' });
    }

    if (!review.doctor_reply?.repliedAt) {
      return res.status(404).json({ message: 'No existing reply to edit' });
    }

    const hours = (Date.now() - new Date(review.doctor_reply.repliedAt).getTime()) / 36e5;
    if (hours > 24) return res.status(400).json({ message: 'Edit window closed' });

    review.doctor_reply.text = text;
    await review.save();
    res.json({ message: 'Reply updated' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Server error' });
  }
};


exports.editDoctorReply = async (req, res) => {
  try {
    const { id } = req.params;
    const { text } = req.body;

    const review = await Review.findById(id);
    if (!review) return res.status(404).json({ message: 'Review not found' });

    if (req.user.role !== 'doctor') {
      return res.status(403).json({ message: 'Not allowed' });
    }

    const me = await Doctor.findOne({ userId: req.user._id }).select('_id').lean();
    if (!me || String(review.doctorId) !== String(me._id)) {
      return res.status(403).json({ message: 'Not allowed' });
    }

    if (!review.doctor_reply?.repliedAt) {
      return res.status(404).json({ message: 'No existing reply to edit' });
    }

    const hours = (Date.now() - new Date(review.doctor_reply.repliedAt).getTime()) / 36e5;
    if (hours > 24) return res.status(400).json({ message: 'Edit window closed' });

    review.doctor_reply.text = text;
    await review.save();
    res.json({ message: 'Reply updated' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Server error' });
  }
};

// GET /reviews/:id
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
