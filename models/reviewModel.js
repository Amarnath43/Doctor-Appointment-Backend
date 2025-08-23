const mongoose = require('mongoose');

const ReviewSchema = new mongoose.Schema(
  {
    appointmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Appointment',
      required: true,
      unique: true, // one review per appointment
    },
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Doctor',
      required: true,
      index: true,
    },
    hospitalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Hospital',
      required: true,
      index: true,
    },
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    rating_overall: {
      type: Number,
      min: 1,
      max: 5,
      required: true,
    },
    text: {
      type: String,
      minlength: 20,
      maxlength: 800,
      required: true,
    },
    status: {
      type: String,
      enum: ['approved', 'pending', 'rejected'],
      default: 'approved',
      index: true,
    },
    doctor_reply: {
      text: { type: String, maxlength: 800 },
      repliedAt: { type: Date },
    },
  },
  { timestamps: true }
);

// 1) Global feed / default listing with stable keyset pagination
ReviewSchema.index({ createdAt: -1, _id: -1 });

// 2) Moderation queues (filter by status + newest first)
ReviewSchema.index({ status: 1, createdAt: -1, _id: -1 });

// 3) Doctor pages (optionally with status filter)
ReviewSchema.index({ doctorId: 1, createdAt: -1, _id: -1 });
ReviewSchema.index({ doctorId: 1, status: 1, createdAt: -1, _id: -1 });

// 4) Hospital pages (optionally with status filter)
ReviewSchema.index({ hospitalId: 1, createdAt: -1, _id: -1 });
ReviewSchema.index({ hospitalId: 1, status: 1, createdAt: -1, _id: -1 });

// 5) Patient profile (all reviews by patient)
ReviewSchema.index({ patientId: 1, createdAt: -1,_id: -1  });

// 6) (Optional) Fast “has reply = true”
ReviewSchema.index(
  { 'doctor_reply.repliedAt': -1 },
  { partialFilterExpression: { 'doctor_reply.text': { $exists: true, $ne: '' } } }
);

ReviewSchema.index({ status: 1, rating_overall: 1, createdAt: -1, _id: -1 });


module.exports = mongoose.model('Review', ReviewSchema);
