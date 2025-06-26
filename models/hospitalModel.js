const mongoose = require('mongoose');

const hospitalSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  location: {
    type: String,
    trim: true
  },
  googleMapsLink: {
    type: String,
    trim: true
  },
  phoneNumber: {
    type: String,
    match: [
      /^[6-9]{1}[0-9]{9}$/,
      "Please provide a valid 10-digit Indian phone number starting with 6-9"
    ]
  },
  imageUrl: {
    type: String,
    default: null,
    trim: true
  },
  createdByDoctor: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    enum: ['pending', 'active', 'rejected'],
    default: 'pending'
  },
  description: {
    type:String,
    trim:true
  },
  departments:[
    {
      type:String,
      trim:true
    }
  ],
  facilities: [{
  type: String,
  trim: true
}],

timings: {
  weekdays: { type: String },
  weekends: { type: String }
}

}, { timestamps: true });

module.exports = mongoose.model('Hospital', hospitalSchema);
