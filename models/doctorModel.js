const mongoose = require('mongoose');

const availabilitySchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true,
  },
  slots: [{ type: String }]
}, { _id: false });

const nextAvailabilitySchema = new mongoose.Schema({
  date: String,
  time: String,
  dateTime: String
}, { _id: false });

const doctorSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  specialization: {
    type: String,
    required: true,
  },
  experience: {
    type: Number,
    required: true,
  },
  hospital: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hospital',
    required: true,
  },
  fee: {
    type: Number,
    required: true
  },
  bio: {
    type: String,
    required: true
  },
  availability: [availabilitySchema],         // contains only 7-day window (past + upcoming)
  pastAvailability: [availabilitySchema],     // stores expired slots
  nextAvailability: nextAvailabilitySchema,   // precomputed next bookable slot
  status: {
    type: String,
    enum: ['pending', 'active', 'blocked'],
    default: 'pending'
  },
  ratingAvg: { type: Number, default: 0 },
ratingCount: { type: Number, default: 0 },
}, { timestamps: true });

doctorSchema.index({ ratingAvg: -1, ratingCount: -1 });

module.exports = mongoose.model('Doctor', doctorSchema);
