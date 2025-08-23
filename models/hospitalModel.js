const mongoose = require('mongoose');

const hospitalSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },     
    location: { type: String, trim: true },                 

    googleMapsLink: { type: String, trim: true },          

    // normalize to digits; validate in Joi
    phoneNumber: {
      type: String,
      set: (v) => (v ? String(v).replace(/\D/g, '') : v),
    },

    images: { type: [String], default: [] },
    createdByDoctor: { type: Boolean, default: false },

    status: {
      type: String,
      enum: ['pending', 'active', 'blocked'],
      default: 'pending',
      index: true,
    },

    description: { type: String, trim: true },

    departments: {
      type: [String],
      default: [],
      set: (arr) => (arr || []).map((s) => s.trim()).filter(Boolean),
    },
    availableTests: {
      type: [String],
      default: [],
      set: (arr) => (arr || []).map((s) => s.trim()).filter(Boolean),
    },
    facilities: {
      type: [String],
      default: [],
      set: (arr) => (arr || []).map((s) => s.trim()).filter(Boolean),
    },

    timings: {
      weekdays: { type: String, trim: true },
      weekends: { type: String, trim: true },
    },
  },
  { timestamps: true }
);

// case-insensitive uniqueness on (name, location)
hospitalSchema.index(
  { name: 1, location: 1 },
  { unique: true, collation: { locale: 'en', strength: 2 } }
);

// common filter/sort path
hospitalSchema.index({ status: 1, createdAt: -1 });

// one text index per collection
hospitalSchema.index({ name: 'text', location: 'text' });

module.exports = mongoose.model('Hospital', hospitalSchema);
