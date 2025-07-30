const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../models/userModel')


const availabilitySchema = new mongoose.Schema({
    date: {
        type: Date,
        required: true,
    },
    slots: [
        {
            type: String
        }

    ]
})

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
    availability: [availabilitySchema],
    status: {
        type: String,
        enum: ['pending', 'active', 'blocked'],
        default: 'pending' // admin approval required
    },
    nextAvailability: {
        date: String,
        time: String,
        dateTime: String
    }

}, {
    timestamps: true
})

module.exports = mongoose.model('Doctor', doctorSchema);