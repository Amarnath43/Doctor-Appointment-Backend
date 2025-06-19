const { default: mongoose } = require('mongoose');
const Doctor=require('../models/doctorModel')
const User=require('../models/userModel')


const appointmentSchema=new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    doctorId:{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Doctor'
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
        enum: ['confirmed', 'cancelled', 'completed'],
        default: 'confirmed'
    }
},{
    timestamps: true
});

module.exports=mongoose.model('Appointment',appointmentSchema)