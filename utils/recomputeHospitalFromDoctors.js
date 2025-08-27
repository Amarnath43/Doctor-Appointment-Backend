const Doctor = require('../models/doctorModel');
const Review = require('../models/reviewModel');
const Hospital=require('../models/hospitalModel')
const mongoose = require('mongoose');
const {
  Types: { ObjectId },
} = mongoose;


const recomputeHospitalFromDoctors=async(hospitalId, session = null)=>{
  if (!ObjectId.isValid(hospitalId)) return;

  const cursor = Doctor.aggregate([
    { $match: { hospital: new ObjectId(hospitalId) } },
    {
      $project: {
        ratingAvg: { $ifNull: ['$ratingAvg', 0] },
        ratingCount: { $ifNull: ['$ratingCount', 0] },
      },
    },
    {
      $group: {
        _id: null,
        totalCount: { $sum: '$ratingCount' },
        weightedSum: { $sum: { $multiply: ['$ratingAvg', '$ratingCount'] } },
      },
    },
    {
      $project: {
        _id: 0,
        ratingCount: '$totalCount',
        ratingAvg: {
          $cond: [
            { $gt: ['$totalCount', 0] },
            { $divide: ['$weightedSum', '$totalCount'] },
            0,
          ],
        },
      },
    },
  ]);

  const agg = session ? await cursor.session(session) : await cursor;
  const stats = agg[0] || { ratingCount: 0, ratingAvg: 0 };
  const roundedAvg = stats.ratingCount ? Number(stats.ratingAvg.toFixed(2)) : 0;

  // If you don’t store these on Hospital, you can skip this write
  await Hospital.findByIdAndUpdate(
    hospitalId,
    {
      $set: {
        ratingCount: stats.ratingCount,
        ratingAvg: roundedAvg,
      },
    },
    { session }
  );
}

module.exports={recomputeHospitalFromDoctors}
