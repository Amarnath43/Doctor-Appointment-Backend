const { default: mongoose } = require('mongoose');
const Doctor=require('../models/doctorModel')
const User=require('../models/userModel')


const appointmentSchema=new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    doctorId:{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Doctor',
        required: true
    },
   
    date:{
        type: Date,
        required: true

    },
    slot:{
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['Confirmed', 'Cancelled', 'Completed'],
        default: 'Confirmed'
    },
    duration: {
  type: Number,
  enum: [15, 30],
  default: 30
},
isPaid: { type: Boolean, default: false },
paymentMode: { type: String,
    enum: ['Cash', 'Online'],
    default: 'Cash'
}

},{
    timestamps: true
});

appointmentSchema.index({ doctorId: 1, date: 1 });

// user history lists
appointmentSchema.index({ userId: 1, date: -1 });

// status filters fast
appointmentSchema.index({ status: 1 });
// Appointment schema
appointmentSchema.index(
  { doctorId: 1, date: 1, slot: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'Confirmed' } }
);

//Ensures a doctor cannot have two bookings for the same time slot on the same day — even under high concurrency.

module.exports=mongoose.model('Appointment',appointmentSchema)