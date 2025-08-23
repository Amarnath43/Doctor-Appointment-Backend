// validations/reviewValidation.js
const Joi = require('joi');

// Reusable ObjectId string
const objectId = Joi.string().pattern(/^[a-f\d]{24}$/i).message('"{{#label}}" must be a valid ObjectId');

// -------------------------------
// BODY-ONLY SCHEMAS (recommended)
// -------------------------------

// Patient creates a review
// for POST /reviews
exports.createReviewBody = Joi.object({
  appointmentId: objectId.required(),
  text: Joi.string().min(20).max(800).required(),
  rating_overall: Joi.number().integer().min(1).max(5).required(),
}).required();

// Patient edits their own review (within 24h – enforce on server logic)
// for PATCH /reviews/:id
exports.editReviewBody = Joi.object({
  text: Joi.string().min(20).max(800),
  rating_overall: Joi.number().integer().min(1).max(5),
})
  .min(1) // at least one field is required
  .required();

// Doctor replies to a review
// for POST /reviews/:id/reply
exports.doctorReplyBody = Joi.object({
  text: Joi.string().trim().min(1).max(800).required(),
}).required();

// Doctor edits an existing reply
// for PATCH /reviews/:id/reply
exports.doctorEditReplyBody = Joi.object({
  text: Joi.string().trim().min(1).max(800).required(),
}).required();

// -----------------------------------------
// OPTIONAL PARAM / QUERY SCHEMAS (use if needed)
// -----------------------------------------

// Params
exports.reviewIdParams = Joi.object({
  id: objectId.required(),
});

exports.doctorIdParams = Joi.object({
  doctorId: objectId.required(),
});

exports.hospitalIdParams = Joi.object({
  hospitalId: objectId.required(),
});

// Queries
exports.listByDoctorQuery = Joi.object({
  page: Joi.number().min(1).default(1),
  limit: Joi.number().min(1).max(100).default(20),
});

exports.listByHospitalQuery = Joi.object({
  page: Joi.number().min(1).default(1),
  limit: Joi.number().min(1).max(100).default(20),
});

// Doctor panel filters
exports.listMyDoctorReviewsQuery = Joi.object({
  page: Joi.number().min(1).default(1),
  limit: Joi.number().min(1).max(100).default(20),
  status: Joi.string().valid('all', 'approved', 'pending', 'rejected').default('newest' ? 'all' : 'all'), // keep 'all'
  needsReply: Joi.string().valid('true', 'false'),
  minRating: Joi.number().integer().min(1).max(5),
  maxRating: Joi.number().integer().min(1).max(5),
  sort: Joi.string().valid('newest', 'oldest', 'lowest', 'highest').default('newest'),
});
