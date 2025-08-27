const Doctor = require('../models/doctorModel');
const Review = require('../models/reviewModel');
const mongoose = require('mongoose');
const {
  Types: { ObjectId },
} = mongoose;
 const recomputeDoctorRatings=async(doctorId, session = null)=> {
  if (!ObjectId.isValid(doctorId)) return;

  const cursor = Review.aggregate([
    { $match: { doctorId: new ObjectId(doctorId), status: 'approved' } },
    {
      $group: {
        _id: null,
        ratingCount: { $sum: 1 },
        ratingAvg: { $avg: '$rating_overall' },
      },
    },
  ]);

  const agg = session ? await cursor.session(session) : await cursor;
  const stats = agg[0] || { ratingCount: 0, ratingAvg: 0 };
  const roundedAvg = stats.ratingCount ? Number(stats.ratingAvg.toFixed(2)) : 0;

  await Doctor.findByIdAndUpdate(
    doctorId,
    {
      $set: {
        ratingCount: stats.ratingCount,
        ratingAvg: roundedAvg,
      },
    },
    { session }
  );
}

module.exports={recomputeDoctorRatings}