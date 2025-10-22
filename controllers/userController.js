const User = require('../models/userModel')
const Doctor = require('../models/doctorModel');
const Hospital = require('../models/hospitalModel')
const generateToken = require('../utils/generateToken');
const generateOTP = require('../utils/generateOTP')
const Appointment = require('../models/appointmentModel')
const bcrypt = require('bcryptjs')
const redis = require('../utils/redis');
const { deleteImageFromS3 } = require('../utils/s3Client');
const { makePublicUrlFromKey } = require('../utils/s3PublicUrl');
const mongoose = require('mongoose');
const { sendOTPEmail } = require('../emails/otp')
const { sendWelcomeUserEmail } = require('../emails/welcomeUser.js');
const buildUserResponse = require('../utils/buildUserResponse');


const registerUser = async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;
    const existingUser = await User.findOne({
      $or: [{ email }, { phone }]
    });

    if (existingUser) {
      if (existingUser.email === email) {
        return res.status(400).json({ message: "Email already registered" });
      }
      if (existingUser.phone === phone) {
        return res.status(400).json({ message: "Phone Number already registered" });
      }
    }

    const otp = generateOTP();
    const hashedOTP = await bcrypt.hash(otp, 10);
    const hashedPassword = await bcrypt.hash(password, 10);
    const data = {
      name,
      email,
      phone,
      password: hashedPassword,
      role: 'user',
      otp: hashedOTP,
      lastOtpSentAt: Date.now(),
      otpExpiry: Date.now() + 10 * 60 * 1000,
    }
    try {
      await redis.set(`signup:${email}`, JSON.stringify(data), 'EX', 600);
      console.log(email)
    } catch (err) {
      console.error('❌ Redis Error:', err);
      return res.status(500).json({ message: 'Internal error while saving OTP' });
    }
    console.log(otp, name)
    await sendOTPEmail(email, { otp, name });

    res.status(201).json({ message: 'OTP sent to email for verification' });
  }

  catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ message: 'Server error during registration' });
  }
};

const verifyOTP = async (req, res) => {
  let { email, otp, isLoginFlow } = req.body;

  try {
    email = String(email).toLowerCase();
    console.log(email, otp, isLoginFlow);
    otp = String(otp);
    const key = isLoginFlow ? `signin:${email}` : `signup:${email}`;
    const tempData = await redis.get(key);
    console.log(tempData)
    if (!tempData)
      return res.status(400).json({ message: 'OTP expired or not requested' });

    const parsed = JSON.parse(tempData);


    const expiryMs = typeof parsed.otpExpiry === "string"
      ? new Date(parsed.otpExpiry).getTime()
      : Number(parsed.otpExpiry);
    if (expiryMs < Date.now()) {
      await redis.del(key);
      return res.status(400).json({ message: "OTP expired" });
    }

    const isMatch = await bcrypt.compare(otp, parsed.otp);
    if (!isMatch) return res.status(400).json({ message: 'Incorrect OTP' });

    if (isLoginFlow) {
      // 🔓 Signin flow
      const existing = await User.findById(parsed.userId);
      if (!existing)
        return res.status(404).json({ message: 'User not found after OTP match' });

      const token = generateToken(existing);

      const responseData = {
        id: existing._id,
        name: existing.name,
        email: existing.email,
        phone: existing.phone,
        role: existing.role,
        status: {
          user: existing.status
        },
        profilePicture: existing.profilePicture || ''
      };

      if (existing.role === 'user') {
        responseData.profile = {
          gender: existing.gender || null,
          dob: existing.dob || null,
          bloodGroup: existing.bloodGroup || null,
          address: existing.address || ''
        };
      }

      if (existing.role === 'doctor') {
        const doctor = await Doctor.findOne({ userId: existing._id }).populate('hospital');

        if (!doctor) {
          return res.status(400).json({ message: 'Doctor profile not found.' });
        }

        responseData.status.doctor = doctor.status;
        responseData.specialization = doctor.specialization;
        responseData.experience = doctor.experience;
        responseData.fee = doctor.fee;
        responseData.bio = doctor.bio;

        if (doctor.hospital) {
          responseData.hospital = {
            name: doctor.hospital.name,
            location: doctor.hospital.location,
            phoneNumber: doctor.hospital.phoneNumber,
            googleMapsLink: doctor.hospital.googleMapsLink
          };
        }
      }

      await redis.del(key);
      return res.status(200).json({
        message: 'Login successful',
        token,
        user: responseData
      });

    } else {
      // 📝 Signup flow
      const role = parsed.role || "user";
      const user = new User({
        name: parsed.name,
        email: parsed.email,
        phone: parsed.phone,
        password: parsed.password,
        isVerified: true
      });

      user._passwordIsHashed = true,
        await user.save();
      await redis.del(key);


      await sendWelcomeUserEmail(user.email, { name: user.name });


      return res.status(201).json({ message: 'User registered successfully' });
    }

  } catch (err) {
    console.error('OTP verification error:', err);
    return res.status(500).json({ message: 'OTP verification failed' });
  }
};





const resendOTP = async (req, res) => {
  try {
    const { email, isLoginFlow } = req.body;

    if (!email) {
      return res.status(400).json({ field: 'email', message: 'Email is required' });
    }

    const key = isLoginFlow ? `signin:${email}` : `signup:${email}`;

    const redisData = await redis.get(key);
    if (!redisData) {
      const flowType = isLoginFlow ? 'signin' : 'signup';
      return res.status(404).json({
        message: `${flowType === 'signin' ? 'Login session expired. Please login again.' : 'Signup session expired. Please register again.'}`
      });
    }

    const parsed = JSON.parse(redisData);


    // Rate limit: block resend if within 60 seconds
    if (parsed.lastOtpSentAt && Date.now() - parsed.lastOtpSentAt < 60000) {
      const remaining = 60 - Math.floor((Date.now() - parsed.lastOtpSentAt) / 1000);
      return res.status(429).json({
        message: `Please wait ${remaining}s before requesting OTP again.`
      });
    }

    // Generate new OTP
    const newOtp = generateOTP();
    const hashedOtp = await bcrypt.hash(newOtp, 10);

    const updatedData = {
      ...parsed,
      otp: hashedOtp,
      otpExpiry: Date.now() + 10 * 60 * 1000,
      lastOtpSentAt: Date.now(),
    };

    // Store in Redis with fresh 10min expiry
    await redis.set(key, JSON.stringify(updatedData), 'EX', 600);

    // Send via email

    await sendOTPEmail(email, { otp: newOtp });

    return res.status(200).json({ message: 'OTP resent successfully' });

  } catch (err) {
    console.error('Resend OTP error:', err);
    return res.status(500).json({ message: 'Server error during OTP resend' });
  }
};




const signin = async (req, res) => {
  try {
    let { email, password } = req.body;

    email = String(email || '').trim().toLowerCase();
    password = String(password || '');


    if (!email || !password) {
      return res.status(400).json({
        field: !email ? 'email' : 'password',
        message: `${!email ? 'Email' : 'Password'} is required`
      });
    }

    const existing = await User.findOne({ email });
    if (!existing) {
      return res.status(404).json({
        field: 'email',
        message: "Email doesn't exist! Please register."
      });
    }

    if (!existing.isVerified) {
      return res.status(401).json({ message: 'Email not verified' });
    }
    console.log(password)
    const match = await existing.matchPassword(password);
    console.log(match)
    if (!match) {
      return res.status(400).json({
        field: 'password',
        message: 'Wrong password.'
      });
    }

    const otp = generateOTP();
    const hashedOTP = await bcrypt.hash(otp, 10);
    const redisData = {
      email,
      otp: hashedOTP,
      role: existing.role,
      userId: existing._id,
      otpExpiry: Date.now() + 10 * 60 * 1000,
    };

    await redis.set(`signin:${email}`, JSON.stringify(redisData), 'EX', 600);
    await sendOTPEmail(email, { otp, name: existing.name });

    res.status(200).json({ message: 'OTP sent to email for login verification', role: existing.role });


  } catch (err) {
    if (err?.__CANCEL__ || err?._silenced) return;
    console.error('Signin error:', err);
    return res.status(500).json({ message: 'Signin error from server' });
  }
};


const sendPasswordResetOTP = async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }
  if (!user.isVerified) return res.status(400).json({ message: 'User is not verified' });

  if (user.lastOtpSentAt && Date.now() - user.lastOtpSentAt < 60 * 1000) {
    return res.status(429).json({ message: 'Wait before requesting another OTP' });
  }
  const OTP = generateOTP();
  const hashedOTP = await bcrypt.hash(OTP, 10);
  user.otp = hashedOTP;
  user.lastOtpSentAt = Date.now();
  user.otpExpiry = Date.now() + 10 * 60 * 1000;
  await user.save();

  await sendOTPEmail(email, {otp:OTP, name: user.name});
  res.status(200).json({ message: 'OTP sent to email for password reset' });
}


const resetPasswordWithOTP = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!user.otp || !user.otpExpiry || user.otpExpiry < Date.now()) {
      return res.status(400).json({ message: 'OTP expired or not requested' });
    }

    const isOtpValid = await bcrypt.compare(otp, user.otp);
    if (!isOtpValid) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    user.password = newPassword;
    user.otp = undefined;
    user.otpExpiry = undefined;
    await user.save();
    return res.status(200).json({ message: 'Password reset successful' });
  }
  catch (err) {
    console.log(err);
    return res.status(500).json({ message: 'server error while resetting password' })
  }
}

const getProfile = async (req, res) => {
  try {
    const userId = req.user._id;
    const existing = await User.findById(userId).lean();
    if (!existing) return res.status(404).json({ message: 'User not found' });

    const responseData = {
      id: existing._id,
      name: existing.name,
      email: existing.email,
      phone: existing.phone,
      role: existing.role,
      status: {
        user: existing.status
      },
      profilePicture: existing.profilePicture || ''
    };



    if (existing.role === 'user') {

      responseData.profile = {
        gender: existing.gender || null,
        dob: existing.dob || null,
        bloodGroup: existing.bloodGroup || null,
        address: existing.address || ''

      };

    }



    if (existing.role === 'doctor') {
      const doctor = await Doctor.findOne({ userId: existing._id }).populate('hospital');
      if (!doctor) {
        return res.status(400).json({ message: 'Doctor profile not found.' });
      }

      responseData.status.doctor = doctor.status;
      responseData.specialization = doctor.specialization;
      responseData.experience = doctor.experience;
      responseData.fee = doctor.fee;
      responseData.bio = doctor.bio;


      if (doctor.hospital) {
        responseData.hospital = {
          name: doctor.hospital.name,
          location: doctor.hospital.location,
          phoneNumber: doctor.hospital.phoneNumber,
          googleMapsLink: doctor.hospital.googleMapsLink

        };

      }

    }
    return res.status(200).json(responseData);


  }
  catch (err) {
    console.log(err);
    return res.status(500).json({ message: 'server error while fetching profile data' })
  }
}

const searchDoctors = async (req, res) => {
  try {
    const {
      keyword = '',
      specialization = '',
      sortBy = 'user.name',
      sortOrder = 'asc',
      page = 1,
      limit = 6
    } = req.query;

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const regex = new RegExp(keyword, 'i');

    const matchConditions = [{ status: 'active' }];

    if (keyword) {
      matchConditions.push({
        $or: [
          { specialization: regex },
          { 'hospital.name': regex },
          { 'user.name': regex }
        ]
      });
    }

    if (specialization) {
      matchConditions.push({ specialization });
    }

    const skip = (pageNum - 1) * limitNum;

    const pipeline = [
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: '$user' },
      {
        $lookup: {
          from: 'hospitals',
          localField: 'hospital',
          foreignField: '_id',
          as: 'hospital'
        }
      },
      { $unwind: '$hospital' },
      {
        $match: { $and: matchConditions }
      },
      {
        $project: {
          specialization: 1,
          experience: 1,
          fee: 1,
          bio: 1,
          nextAvailability: 1,
          'user.profilePicture': 1,
          'user.name': 1,
          'hospital.name': 1,
          'hospital.location': 1,
          'hospital.phoneNumber': 1,
          'hospital.googleMapsLink': 1
        }
      },
      {
        $sort: {
          [sortBy]: sortOrder === 'desc' ? -1 : 1
        }
      },
      { $skip: skip },
      { $limit: limitNum }
    ];

    const countPipeline = [
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: '$user' },
      {
        $match: { $and: matchConditions }
      },
      { $count: 'total' }
    ];

    const [doctors, countResult] = await Promise.all([
      Doctor.aggregate(pipeline),
      Doctor.aggregate(countPipeline)
    ]);

    const totalDoctors = countResult.length > 0 ? countResult[0].total : 0;

    res.status(200).json({
      data: doctors,
      count: totalDoctors,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(totalDoctors / limitNum)
    });

  } catch (err) {
    console.error('Unable to fetch doctor data:', err);
    res.status(500).json({ message: 'Unable to fetch doctor data from server' });
  }
};



const editProfile = async (req, res) => {
  try {
    const userId = req.user._id;
    const role = req.user.role;
    const data = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // --- Update User Fields ---
    user.name = data.name;

    // FIX: Correctly handle profile picture update AND deletion
    if (data.profilePicture !== undefined) {
      const oldPictureKey = user.profilePicture;
      // If a new picture is being uploaded OR the picture is being removed (empty string)
      // and an old picture existed, delete the old one from S3.
      if (oldPictureKey && oldPictureKey !== data.profilePicture) {
        await deleteImageFromS3(oldPictureKey);
      }
      user.profilePicture = data.profilePicture;
    }
    
    if (role === 'user') {
      user.gender = data.gender;
      user.dob = data.dob;
      user.bloodGroup = data.bloodGroup;
      user.address = data.address;
    }

    // --- Password Change Logic ---
    if (data.changePassword) {
      if (!data.oldPassword || !data.newPassword) {
        return res.status(400).json({ message: 'Old and new passwords are required' });
      }
      // Assuming user.matchPassword method exists on your model
      const isMatch = await bcrypt.compare(data.oldPassword, user.password);
      if (!isMatch) {
        return res.status(401).json({ message: 'Incorrect current password' });
      }
      // Assuming a pre-save hook on your model handles hashing
      user.password = data.newPassword;
    }

    const updatedUserDoc = await user.save();

    // --- Update Doctor-specific Fields (if applicable) ---
    if (role === 'doctor') {
      const doctorFields = {
        specialization: data.specialization,
        experience: data.experience,
        fee: data.fee,
        bio: data.bio,
      };
      await Doctor.findOneAndUpdate({ userId }, doctorFields);
    }
    
    // Build and send the final response
    const responseData = await buildUserResponse(updatedUserDoc);

    return res.status(200).json({
      message: 'Profile updated successfully',
      user: responseData,
    });
  } catch (err) {
    console.error('Error updating profile:', err);
    res.status(500).json({ message: 'Server error during profile update' });
  }
};





const searchHospitals = async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    const limit = Math.min(parseInt(req.query.limit || 10, 10), 50);

    // if no query, return a few popular/recent hospitals
    if (!q) {
      const docs = await Hospital.find({})
        .sort({ updatedAt: -1 })
        .limit(limit)
        .select('_id name location')
        .lean();
      return res.json({ hospitals: docs });
    }

    // simple case-insensitive prefix/contains match on name + location
    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

    const docs = await Hospital.find({
      $or: [{ name: regex }, { location: regex }]
    })
      .limit(limit)
      .select('_id name location')
      .lean();

    res.json({ hospitals: docs });
  } catch (err) {
    console.error('Hospital search error:', err);
    res.status(500).json({ message: 'Failed to fetch hospitals' });
  }
};

const allSpecializations = async (req, res) => {
  try {
    const specializations = await Doctor.distinct('specialization', { status: 'active' });
    res.status(200).json({ specializations });
  }
  catch (err) {
    console.error('Error fetching specializations', err);
    res.status(500).json({ message: 'Error fetching specializations ' });
  }
}

{/*
const findDoctorsByHospital = async (req, res) => {
  try {
    const { id } = req.params;
    const search = req.query.search?.trim() || '';
    const specialization = req.query.specialization?.trim() || '';
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const skip = (page - 1) * limit;

    // Validate hospital exists
    const hospitalExists = await Hospital.exists({ _id: id, status: 'active' });
    if (!hospitalExists) {
      return res.status(404).json({ message: 'Hospital not found or inactive' });
    }

    const query = {
      hospital: new mongoose.Types.ObjectId(id),
      status: 'active'
    };

    // Optional filters
    if (search) {
      query.name = { $regex: search, $options: 'i' }; // case-insensitive
    }
    if (specialization) {
      query.specialty = specialization;
    }

    const doctors = await Doctor.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const totalDoctors = await Doctor.countDocuments(query);

    res.status(200).json({
      total: totalDoctors,
      page,
      totalPages: Math.ceil(totalDoctors / limit),
      doctors,
      hasMore: page * limit < totalDoctors
    });
  } catch (err) {
    console.error('Error fetching doctors by hospital', err);
    res.status(500).json({ message: 'Error fetching doctors by hospital' });
  }
};
 */}




const getDoctorData = async (req, res) => {
  try {
    const { id } = req.params
    const doctor = await Doctor.findById(id).populate({
      path: 'userId',
      select: 'name email phone'
    }).populate({
      path: 'hospital',
      select: 'name location'
    }).lean();

    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }
    res.status(200).json(doctor);
  }
  catch (err) {
    console.error('Error fetching doctor data', err);
    res.status(500).json({ message: 'Error fetching doctor data ' });
  }

}

const appointmentHistory = async (req, res) => {
  try {
    const userIdObj = new mongoose.Types.ObjectId(req.user._id);
    const bucket = String(req.query.bucket || 'upcoming'); // 'upcoming' | 'past' | 'cancelled'

    // pagination
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
    const skip = (page - 1) * limit;

    if (!['upcoming', 'past', 'cancelled'].includes(bucket)) {
      return res.status(400).json({ error: 'Invalid bucket value' });
    }

    // 1) scope to this user
    const preMatch = { userId: userIdObj };

    // 2) bucket logic using stored UTC Date field `date` (your appointment datetime)
    const postMatch =
      bucket === 'cancelled'
        ? { status: 'Cancelled' }
        : bucket === 'upcoming'
          ? { status: 'Confirmed', $expr: { $gte: ['$date', '$$NOW'] } }
          : { // past
            $or: [
              { status: 'Completed' },
              { status: 'Confirmed', $expr: { $lt: ['$date', '$$NOW'] } }
            ]
          };

    const [result] = await Appointment.aggregate([
      { $match: preMatch },

      // apply time+status bucket
      { $match: postMatch },

      {
        $facet: {
          total: [{ $count: 'count' }],
          data: [
            // sort by appointment datetime (then createdAt as tiebreaker)
            { $sort: { date: bucket === 'upcoming' ? 1 : -1, createdAt: -1 } },
            { $skip: skip },
            { $limit: limit },

            // PATIENT
            { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'patientUser' } },
            { $unwind: { path: '$patientUser', preserveNullAndEmptyArrays: true } },

            // DOCTOR
            { $lookup: { from: 'doctors', localField: 'doctorId', foreignField: '_id', as: 'doctor' } },
            { $unwind: '$doctor' },

            // DOCTOR'S USER
            { $lookup: { from: 'users', localField: 'doctor.userId', foreignField: '_id', as: 'doctorUser' } },
            { $unwind: '$doctorUser' },

            // HOSPITAL (optional)
            { $lookup: { from: 'hospitals', localField: 'doctor.hospital', foreignField: '_id', as: 'hospital' } },
            { $unwind: { path: '$hospital', preserveNullAndEmptyArrays: true } },

            // REVIEW (this user's review for this appt)
            {
              $lookup: {
                from: 'reviews',
                let: { apptId: '$_id', me: userIdObj },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $and: [
                          { $eq: ['$appointmentId', '$$apptId'] },
                          { $eq: ['$patientId', '$$me'] }
                        ]
                      }
                    }
                  },
                  { $sort: { createdAt: -1 } }, // defensive: latest if duplicates
                  {
                    $project: {
                      _id: 1,
                      rating_overall: 1,
                      text: 1,
                      createdAt: 1,
                      doctor_reply: 1,
                      patientId: 1
                    }
                  },
                  { $limit: 1 }
                ],
                as: 'review'
              }
            },

            // normalize review[] -> review|null and add flags
            {
              $addFields: {
                reviewExists: { $gt: [{ $size: '$review' }, 0] },
                review: {
                  $cond: [
                    { $gt: [{ $size: '$review' }, 0] },
                    { $first: '$review' },
                    null
                  ]
                }
              }
            },
            {
              $set: {
                canEdit: {
                  $and: [
                    '$reviewExists',
                    { $eq: ['$review.patientId', userIdObj] },
                    {
                      $lte: [
                        {
                          $dateDiff: {
                            startDate: '$review.createdAt',
                            endDate: '$$NOW',
                            unit: 'hour'
                          }
                        },
                        24
                      ]
                    }
                  ]
                },
                canEditUntil: {
                  $cond: [
                    '$reviewExists',
                    { $dateAdd: { startDate: '$review.createdAt', unit: 'hour', amount: 24 } },
                    null
                  ]
                }
              }
            },

            // final shape
            {
              $project: {
                _id: 1,
                date: 1,            // UTC Date of the appointment (includes slot)
                slot: 1,            // keep if you still display it
                fee: 1,
                status: 1,
                isPaid: 1,
                paymentMode: 1,
                createdAt: 1,

                patient: {
                  _id: '$patientUser._id',
                  name: '$patientUser.name',
                  email: '$patientUser.email',
                  profilePicture: '$patientUser.profilePicture'
                },

                doctor: {
                  _id: '$doctor._id',
                  specialization: '$doctor.specialization',
                  fee: '$doctor.fee',
                  user: {
                    _id: '$doctorUser._id',
                    name: '$doctorUser.name',
                    email: '$doctorUser.email',
                    profilePicture: '$doctorUser.profilePicture'
                  }
                },

                hospital: { _id: '$hospital._id', name: '$hospital.name' },

                reviewExists: 1,
                canEdit: 1,
                canEditUntil: 1,
                review: {
                  $cond: [
                    { $ne: ['$review._id', null] },
                    {
                      _id: '$review._id',
                      rating_overall: '$review.rating_overall',
                      text: '$review.text',
                      createdAt: '$review.createdAt',
                      doctor_reply: '$review.doctor_reply'
                    },
                    null
                  ]
                }
              }
            }
          ]
        }
      }
    ]);

    const total = result?.total?.[0]?.count || 0;
    const items = result?.data || [];
    const totalPages = Math.max(1, Math.ceil(total / limit));

    res.json({
      items,
      page,
      limit,
      total,
      totalPages,
      hasPrev: page > 1,
      hasNext: page < totalPages
    });
  } catch (err) {
    console.error('Error fetching Appointment History', err);
    res.status(500).json({ message: 'Error fetching Appointment History' });
  }
};





const createAdmin = async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    if (!name || !email || !phone || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const existingUser = await User.findOne({ $or: [{ email }, { phone }] });
    if (existingUser) {
      return res.status(409).json({ message: 'User already exists' });
    }

    const newAdmin = new User({
      name,
      email,
      phone,
      password,
      role: 'admin',
      status: 'active',
    });

    await newAdmin.save();
    res.status(201).json({ message: 'Admin created successfully' });
  } catch (error) {
    console.error('Admin creation failed:', error);
    res.status(500).json({ message: 'Server error' });
  }
};



function escapeRegExp(str = '') {
  // escape user input so regex is safe
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const getHospitals = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
    const searchRaw = (req.query.search || '').trim();

    const query = { status: 'active' };
    if (searchRaw) {
      const rx = new RegExp(escapeRegExp(searchRaw), 'i');
      query.$or = [{ name: rx }, { location: rx }];
    }

    const [items, total] = await Promise.all([
      Hospital.find(query, { name: 1, location: 1, images: 1, createdAt: 1 })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Hospital.countDocuments(query),
    ]);

    // For 3 or 10 items, this simple per-hospital count is fine.
    const data = await Promise.all(
      items.map(async (h) => {
        const doctorCount = await Doctor.countDocuments({ hospital: h._id, status: 'active' });
        const firstImageKey = Array.isArray(h.images) && h.images.length ? h.images[0] : '';
        return {
          _id: h._id,
          name: h.name,
          location: h.location || '',
          imageUrl: makePublicUrlFromKey(firstImageKey),
          doctorCount,
        };
      })
    );

    res.json({
      data,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasMore: page * limit < total,
      },
    });
  } catch (err) {
    console.error('getHospitals error:', err);
    res.status(500).json({ error: 'Failed to fetch hospitals' });
  }
}





module.exports = {
  registerUser, signin, searchDoctors, editProfile, searchHospitals, allSpecializations,
  getDoctorData, appointmentHistory, createAdmin, verifyOTP, resendOTP,
  resetPasswordWithOTP, sendPasswordResetOTP, getHospitals, getProfile
}