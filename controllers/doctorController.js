const Doctor = require('../models/doctorModel');
const User = require('../models/userModel');
const Fuse = require('fuse.js');
const mongoose = require('mongoose');
const Hospital = require('../models/hospitalModel');
const Appointment = require('../models/appointmentModel');
const Review=require('../models/reviewModel');
const generateOTP = require('../utils/generateOTP')
const redis = require('../utils/redis');
const bcrypt = require('bcryptjs');
const getNextAvailableSlot = require('../utils/getNextAvailableSlot');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const isSameOrAfter = require('dayjs/plugin/isSameOrAfter');
dayjs.extend(utc);
dayjs.extend(isSameOrAfter);
const {sendOTPEmail}=require('../emails/otp')
const { sendWelcomeDoctorEmail } = require('../emails/welcomeDoctor');


{/**
const registerDoctor = async (req, res) => {
    let session;
    try {
        session = await mongoose.startSession();
        session.startTransaction();
        const { name, email, phone, password, specialization, experience, hospitalName, location, googleMapsLink, hospitalPhoneNumber, fee, bio } = req.body;
        const existingUser = await User.findOne({$or:[{email},{phone}]}).session(session);
        if (existingUser) {
            await session.abortTransaction();
            session.endSession();

                if (existingUser.phone === phone &&existingUser.email!=email) {
                    return res.status(400).json({ field:'phone',message: 'Mobile Number already registered' });
                }

                if (existingUser.email === email) {
                return res.status(400).json({ field: 'email', message: 'Email already registered' });
            }
            }
        

        let hospital = await Hospital.findOne({ name: { $regex: `^${hospitalName}$`, $options: 'i' } }).session(session);

        if (!hospital) {
            const allHospitals = await Hospital.find();
            const fuse = new Fuse(allHospitals, {
                keys: ['name', 'location'],
                threshold: 0.3
            })
            const result = fuse.search(hospitalName);
            if (result.length > 0) {
                hospital = result[0].item;
            }
        }

        if (!hospital) {
            hospital = await Hospital.create([{
                name: hospitalName,
                location,
                googleMapsLink,
                phoneNumber: hospitalPhoneNumber,
                createdByDoctor: true
            }], { session })

            hospital = hospital[0]
        }

        const newUser = new User({
            name,
            email,
            phone,
            password,
            role: 'doctor'
        });

        await newUser.save({ session });

        await Doctor.create([{
            userId: newUser._id,
            specialization,
            experience,
            hospital: hospital._id,
            fee,
            bio
        }], { session });

        await session.commitTransaction();
        session.endSession();

        res.status(201).json({
            message: 'Doctor registration successful. Waiting for admin approval.',
            role: newUser.role,
            status: newUser.status
        });
    }
    catch (err) {
        await session.abortTransaction();
        session.endSession();
        console.error("Error registering doctor:", err);
        res.status(500).json({ message: 'Server error' });
    }
}
    */}


const registerDoctor = async (req, res) => {
  const formData = req.body;
  const { email, phone } = formData;

  if (!email) {
    return res.status(400).json({ field: 'email', message: 'Email is required' });
  }

  const existingUser = await User.findOne({ $or: [{ email }, { phone }] })
  if (existingUser) {

    if (existingUser.phone === phone && existingUser.email != email) {
      return res.status(400).json({ field: 'phone', message: 'Mobile Number already registered' });
    }

    if (existingUser.email === email) {
      return res.status(400).json({ field: 'email', message: 'Email already registered' });
    }
  }


  try {
    const otp = generateOTP();
    const hashedOtp = await bcrypt.hash(otp, 10);
    const now = Date.now();

    const redisKey = `register:doctor:data:${email}`;

    const updatedFormData = {
      ...formData,
      otp: hashedOtp,
      otpExpiry: now + 10 * 60 * 1000, // 10 mins
      lastOtpSentAt: now
    };

    await redis.set(redisKey, JSON.stringify(updatedFormData), { EX: 600 });

    await sendOTPEmail(
      email, {
        otp,
        name:formData.name
      }
    );

    res.status(200).json({ message: 'OTP sent to doctor email.' });

  } catch (err) {
    console.error('sendDoctorOtp error:', err);
    res.status(500).json({ message: 'Failed to send OTP. Try again later.' });
  }
};

const resendDoctorOtp = async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ field: 'email', message: 'Email is required' });

  try {
    const redisKey = `register:doctor:data:${email}`;
    const redisData = await redis.get(redisKey);

    if (!redisData) {
      return res.status(404).json({ message: 'Registration session expired. Please fill the form again.' });
    }

    const parsed = JSON.parse(redisData);
    const now = Date.now();

    if (parsed.lastOtpSentAt && now - parsed.lastOtpSentAt < 60000) {
      const remaining = 60 - Math.floor((now - parsed.lastOtpSentAt) / 1000);
      return res.status(429).json({ message: `Please wait ${remaining}s before requesting OTP again.` });
    }

    const newOtp = generateOTP();
    const hashedOTP = await bcrypt.hash(newOtp, 10);
    const updatedData = {
      ...parsed,
      otp: hashedOTP,
      otpExpiry: now + 10 * 60 * 1000,
      lastOtpSentAt: now
    };

    await redis.set(redisKey, JSON.stringify(updatedData), { EX: 600 });

    await sendEmail(email, newOtp);

    res.status(200).json({ message: 'OTP resent successfully.' });

  } catch (err) {
    console.error('resendDoctorOtp error:', err);
    res.status(500).json({ message: 'Server error during OTP resend.' });
  }
};


const verifyDoctorOtpAndRegister = async (req, res) => {
  const { email, otp } = req.body;
  const redisKey = `register:doctor:data:${(email || '').toLowerCase()}`;
  let session;

  try {
    
    const formDataStr = await redis.get(redisKey);
    if (!formDataStr) {
      return res.status(400).json({ message: 'Form session expired. Please re-submit.' });
    }

    const formData = JSON.parse(formDataStr);
    const { otp: storedOtp, otpExpiry } = formData;

  
    if (!storedOtp || !otpExpiry || Date.now() > otpExpiry) {
      return res.status(400).json({ message: 'OTP expired. Please request a new one.' });
    }
    const otpOk = await bcrypt.compare(otp, storedOtp);
    if (!otpOk) {
      return res.status(400).json({ message: 'Invalid OTP.' });
    }

  
    const {
      name,
      phone,
      password,
      specialization,
      experience,
      hospitalId,
      hospitalName,
      location,
      googleMapsLink,
      hospitalPhoneNumber,
      fee,
      bio
    } = formData;

    const normEmail = (formData.email || email || '').toLowerCase().trim();
    const normPhone = (phone || '').trim();

   
    const existingUser = await User.findOne({
      $or: [{ email: normEmail }, { phone: normPhone }]
    }).select('_id email phone');
    if (existingUser) {
      return res.status(409).json({ message: 'Email or phone already registered.' });
    }

   
    session = await mongoose.startSession();
    await session.withTransaction(async () => {
      
      let hospitalDoc = null;

      if (hospitalId) {
        hospitalDoc = await Hospital.findById(hospitalId).session(session).select('_id');
        if (!hospitalDoc) {
          throw new Error('Selected hospital no longer exists.');
        }
      } else {
       
        hospitalDoc = await Hospital.findOne({
          name: { $regex: `^${hospitalName}$`, $options: 'i' }
        }).session(session).select('_id');

       
        if (!hospitalDoc) {
          const [created] = await Hospital.create([{
            name: hospitalName?.trim(),
            location: location?.trim() || '',
            googleMapsLink: googleMapsLink?.trim() || '',
            phoneNumber: hospitalPhoneNumber?.trim() || '',
            createdByDoctor: true,
            isActive: true
          }], { session });
          hospitalDoc = created;
        }
      }

     
      const hashedPassword = await bcrypt.hash(password, 10);
      const user = new User({
        name: name?.trim(),
        email: normEmail,
        phone: normPhone,
        password: hashedPassword,
        role: 'doctor',
        isVerified: true
      });
     
      user._passwordIsHashed = true;
      await user.save({ session });

   
      await Doctor.create([{
        userId: user._id,
        specialization: specialization?.trim(),
        experience: Number(experience) || 0,
        hospital: hospitalDoc._id,
        fee: Number(fee),
        bio: bio?.trim(),
        status: 'pending' 
      }], { session });

     
      await redis.del(redisKey);

    
      (async () => {
        try {
          await sendWelcomeDoctorEmail(user.email, { name: user.name });
        } catch (e) {
          console.error('Welcome email failed:', e?.message || e);
        }
      })();

      res.status(201).json({
        message: 'Doctor registration successful. Waiting for admin approval.',
        role: user.role,
        status: 'pending'
      });
    });

  } catch (err) {
    console.error('verifyDoctorOtpAndRegister error:', err);
    // If response not sent yet
    if (!res.headersSent) {
      res.status(500).json({ message: 'Server error during OTP verification or registration.' });
    }
  } finally {
    if (session) session.endSession();
  }
};



// POST: Set doctor availability


const doctorAvailability = async (req, res) => {
  try {
    const doctorId = req.user._id;
    const updates = Array.isArray(req.body) ? req.body : []; // [{date, slots}, ...]

    const doctor = await Doctor.findOne({ userId: doctorId });
    if (!doctor) return res.status(404).json({ message: 'Doctor not found' });

    const now = dayjs.utc();

    // Map: dateStr -> desired slots (may be empty)
    const desired = new Map();
    const updateDates = [];

    for (const u of updates) {
      const dateStr = dayjs.utc(u.date).format('YYYY-MM-DD');
      updateDates.push(dateStr);
      desired.set(dateStr, Array.isArray(u.slots) ? u.slots : []);
    }

    // Fetch booked for all updated days in one query
    const dateObjs = updateDates.map(ds => dayjs.utc(ds).startOf('day').toDate());
    const appts = await Appointment.find({
      doctorId: doctor._id,
      date: { $in: dateObjs },
      status: 'Confirmed'
    }).select('date slot');
console.log("vbn")
    console.log(appts)
    const bookedMap = new Map(); // dateStr -> Set(slots)
    for (const a of appts) {
      const ds = dayjs.utc(a.date).format('YYYY-MM-DD');
      if (!bookedMap.has(ds)) bookedMap.set(ds, new Set());
      bookedMap.get(ds).add(a.slot);
    }

    // Turn current availability into a map
    const curMap = new Map(); // dateStr -> Set(slots)
    for (const entry of doctor.availability) {
      const ds = dayjs.utc(entry.date).format('YYYY-MM-DD');
      curMap.set(ds, new Set(entry.slots));
    }

    // Apply each updated date (including empty arrays = clear)
    for (const [ds, wantedSlots] of desired.entries()) {
      const dayStart = dayjs.utc(ds).startOf('day');
      if (dayStart.isBefore(now.startOf('day'))) {
        // ignore attempts to change past days
        continue;
      }

      const booked = bookedMap.get(ds) || new Set();
      const nextSet = new Set();

      for (const slot of wantedSlots) {
        const slotTime = dayjs.utc(`${ds}T${slot}`);
        if (slotTime.isAfter(now) && !booked.has(slot)) nextSet.add(slot);
      }

      // If wanted was empty, this becomes empty => clears the day
      curMap.set(ds, nextSet);
    }

    // Rebuild array; keep also any days we didn’t touch (future only)
    const newAvail = [];
    for (const [ds, set] of curMap.entries()) {
      const slots = Array.from(set).sort();
      const dateObj = dayjs.utc(ds).startOf('day').toDate();
      const isFuture = dayjs.utc(dateObj).isSameOrAfter(now.startOf('day'));
      if (isFuture && slots.length > 0) {
        newAvail.push({ date: dateObj, slots });
      }
    }

    newAvail.sort((a, b) => a.date - b.date);
    doctor.availability = newAvail;
    doctor.nextAvailability = getNextAvailableSlot(doctor.availability);
    await doctor.save();

    return res.status(200).json({ message: 'Availability updated successfully' });
  } catch (err) {
    console.error('Error setting availability:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};


const generateTimeSlots = (start = '09:00', end = '21:00', duration = 30) => {
  const slots = [];
  let current = dayjs.utc(`${dayjs.utc().format('YYYY-MM-DD')}T${start}`);
  const endTime = dayjs.utc(`${dayjs.utc().format('YYYY-MM-DD')}T${end}`);

  while (current.isBefore(endTime)) {
    slots.push(current.format('HH:mm'));
    current = current.add(duration, 'minute');
  }

  return slots;
};

const getDoctorAvailability = async (req, res) => {
  try {
    const doctorId = req.user._id;
    const doctor = await Doctor.findOne({ userId: doctorId });
    if (!doctor) return res.status(404).json({ message: 'Doctor not found' });

    const now = dayjs.utc();
    const start = now.startOf('day');
    const end = now.add(6, 'day').endOf('day');

    const appointments = await Appointment.find({
      doctorId: doctor._id,
      date: { $gte: start.toDate(), $lte: end.toDate() },
      status: 'Confirmed'
    });

    const booked = {};
    for (const appt of appointments) {
      const dateStr = dayjs.utc(appt.date).format('YYYY-MM-DD');
      if (!booked[dateStr]) booked[dateStr] = [];
      booked[dateStr].push(appt.slot);
    }

    const available = doctor.availability.map((entry) => ({
      date: dayjs.utc(entry.date).format('YYYY-MM-DD'),
      slots: entry.slots
    }));

    const vacant = {};

    for (let i = 0; i < 7; i++) {
      const day = now.add(i, 'day');
      const dateStr = day.format('YYYY-MM-DD');

      const allSlots = generateTimeSlots('09:00', '21:00'); // customize as needed
      const bookedSet = new Set(booked[dateStr] || []);
      const availableSet = new Set(
        available.find(d => d.date === dateStr)?.slots || []
      );

      vacant[dateStr] = allSlots.filter(slot => {
        const slotTime = dayjs.utc(`${dateStr}T${slot}`);
        return (
          slotTime.isAfter(now) &&
          !bookedSet.has(slot) &&
          !availableSet.has(slot)
        );
      });
    }

    return res.status(200).json({ available, booked, vacant });
  } catch (err) {
    console.error('Error fetching availability:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};




const getDoctorAnalytics = async (req, res) => {
  try {
    const doctorId = req.user._id; // from auth middleware
    const doctor = await Doctor.findOne({ userId: doctorId });

    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }

    const fee = doctor.fee || 0;
    const now = new Date();

    // Count appointments
    const completed = await Appointment.countDocuments({ doctorId: doctor._id, status: 'Completed' });
    const cancelled = await Appointment.countDocuments({ doctorId: doctor._id, status: 'Cancelled' });
    const upcoming = await Appointment.countDocuments({
      doctorId: doctor._id,
      status: 'Confirmed',
      date: { $gte: now }
    });

    // Unique patients
    const patientIds = await Appointment.distinct('userId', { doctorId: doctor._id });
    const totalPatients = patientIds.length;

    // Revenue
    const totalRevenue = completed * fee;

    return res.status(200).json({
      completed,
      cancelled,
      upcoming,
      totalPatients,
      totalRevenue
    });

  } catch (error) {
    console.error('Doctor Analytics Error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

{
  /*
  const existingDoctorSlots = async (req, res) => {
  try {
    const id = req.user._id;
    const doctor = await Doctor.findOne({ userId: id });
    const availability = doctor.availability.map(a => ({
      date: a.date.toISOString().split('T')[0],
      slots: a.slots
    }));

    res.json(availability);

  }
  catch (error) {
    console.error('Error fetching existing availabilty data:', error);
    res.status(500).json({ message: 'Internal server error, Error fetching existing availabilty data' });
  }

}
   */

}



const getDoctorDetails = async (req, res) => {
  try {
    const { doctorId } = req.params;
    const doctor = await Doctor.findById(doctorId).populate({
      path: 'userId',
      select: 'name email phone profilePicture'
    }).populate({
      path: 'hospital',
      select: 'name location'
    }).lean();

    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }

    const now = new Date();
    const todayMid = new Date(now).setHours(0, 0, 0, 0);
    const todayStr = now.toISOString().split('T')[0];
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    doctor.availability = (doctor.availability || [])
      // 1) keep only today+future dates
      .filter(a => {
        const dayMid = new Date(a.date).setHours(0, 0, 0, 0);
        return dayMid >= todayMid;
      })
      // 2) for each, drop past slots if it’s today’s date
      .map(a => {
        const dateStr = new Date(a.date).toISOString().split('T')[0];
        let slots = a.slots;

        if (dateStr === todayStr) {
          slots = slots.filter(slot => {
            const [h, m] = slot.split(':').map(Number);
            return (h * 60 + m) > nowMinutes;
          });
        }

        return { date: dateStr, slots };
      })
      // 3) remove any day that now has zero slots
      .filter(day => day.slots.length > 0);

    return res.status(200).json(doctor);
  } catch (err) {
    console.error('Error fetching availability:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

const updateAppointmentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const allowedStatuses = ['Confirmed', 'Completed', 'Cancelled'];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    // Find the appointment
    const appointment = await Appointment.findById(id);
    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    // Update status
    appointment.status = status;

    // If marked as completed, mark it as paid
    if (status === 'Completed') {
      appointment.isPaid = true;
    }

    await appointment.save();

    res.json({ message: 'Status updated', appointment });
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};


const getDoctorDashboardSummary = async (req, res) => {
  try {
    const userId = req.user._id;
    const doctor = await Doctor.findOne({ userId });
    if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found' });

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const matchStage = { doctorId: doctor._id, date: today };

    const appointments = await Appointment.aggregate([
      { $match: matchStage },
      {
        $lookup: {
          from: 'doctors',
          localField: 'doctorId',
          foreignField: '_id',
          as: 'doctor'
        }
      },
       { $unwind: '$doctor' },
      {
        $project: {
          slot: 1,
          status: 1,
          isPaid: 1,
          'doctor.fee': 1,
        }
      }
    ]);
    console.log(appointments)

    const summary = {
      confirmed: 0,
      completed: 0,
      cancelled: 0,
      totalAppointments: appointments.length,
      revenue: 0
    };

    const confirmed = [];

    console.log(appointments+"sexy")

    appointments.forEach(appt => {
      const s = appt.status.toLowerCase();
      if (s === 'confirmed') {
        summary.confirmed++;
        confirmed.push(appt);
      }
      if (s === 'completed') summary.completed++;
      if (s === 'cancelled') summary.cancelled++;
      if (s === 'completed' && appt.isPaid && appt.doctor.fee) {
        summary.revenue += appt.doctor.fee;
      }
    });

    confirmed.sort((a, b) => a.slot.localeCompare(b.slot));
    const next = confirmed[0];

    // If needed, enrich nextAppointment
    let nextAppointment = null;
    if (next) {
      const populated = await Appointment.findById(next._id)
        .populate('userId', 'name')
        .populate({
          path: 'doctorId',
          populate: [
            { path: 'userId', select: 'name' },
            { path: 'hospital', select: 'name location' }
          ]
        });

      nextAppointment = {
        id: populated._id,
        date: dayjs(populated.date).format('YYYY-MM-DD'),
        time: populated.slot,
        status: populated.status,
        modeOfPayment: populated.paymentMode,
        patientName: populated.userId.name,
        doctorName: populated.doctorId.userId.name,
        specialization: populated.doctorId.specialization,
        hospitalName: populated.doctorId.hospital.name,
        hospitalLocation: populated.doctorId.hospital.location
      };
    }

    return res.status(200).json({
      success: true,
      data: { summary, nextAppointment }
    });

  } catch (err) {
    console.error("Error in getDoctorDashboardSummary:", err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};


const getTodayAppointments = async (req, res) => {
  try {
    const userId = req.user._id;
    const { status, page = 1, limit = 10 } = req.query;

    const doctor = await Doctor.findOne({ userId });
    if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found' });
    console.log(doctor._id)
    // Ensure date matches midnight UTC
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    // Filter match
    const matchStage = {
      doctorId: doctor._id,
      date: today
    };
    if (status && status !== 'All') {
      matchStage.status = status;
    }
    console.log(matchStage)

    const skip = (parseInt(page) - 1) * parseInt(limit);
    console.log(skip)

    const appointmentsAggregation = await Appointment.aggregate([
      { $match: matchStage },
      {
        $facet: {
          data: [
            { $sort: { slot: 1 } },
            { $skip: skip },
            { $limit: parseInt(limit) },
            {
              $lookup: {
                from: 'users',
                localField: 'userId',
                foreignField: '_id',
                as: 'patient'
              }
            },
            { $unwind: '$patient' },
            {
              $lookup: {
                from: 'doctors',
                localField: 'doctorId',
                foreignField: '_id',
                as: 'doctor'
              }
            },
            { $unwind: '$doctor' },
            {
              $lookup: {
                from: 'users',
                localField: 'doctor.userId',
                foreignField: '_id',
                as: 'doctorUser'
              }
            },
            { $unwind: '$doctorUser' },
            {
              $lookup: {
                from: 'hospitals',
                localField: 'doctor.hospital',
                foreignField: '_id',
                as: 'hospital'
              }
            },
            { $unwind: '$hospital' },
            {
              $project: {
                _id: 0,
                id: '$_id',
                date: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
                time: '$slot',
                status: '$status',
                modeOfPayment: '$paymentMode',
                patientName: '$patient.name',
                doctorName: '$doctorUser.name',
                specialization: '$doctor.specialization',
                hospitalName: '$hospital.name',
                hospitalLocation: '$hospital.location'
              }
            }
          ],
          totalCount: [
            { $count: 'count' } // ✅ No need to reapply $match
          ]
        }
      }
    ]);
    console.log(appointmentsAggregation[0])

    const appointments = appointmentsAggregation[0].data;
    console.log(appointments)
    const totalCount = appointmentsAggregation[0].totalCount[0]?.count || 0;
    const totalPages = Math.ceil(totalCount / parseInt(limit));

    res.status(200).json({
      success: true,
      data: appointments,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalCount
      }
    });

  } catch (err) {
    console.error('Error in getTodayAppointments:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// GET /doctor/reviews  (doctor panel)
const listMyDoctorReviews = async (req, res) => {
  try {
    

    const userId = req.user._id; 
    const doctor=await Doctor.findOne({userId});
    const doctorId=doctor._id;

    const pageRaw = Number(req.query.page);
    const limitRaw = Number(req.query.limit);
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
    const limit = Number.isFinite(limitRaw) ? Math.min(100, Math.max(1, limitRaw)) : 20;
    const skip = (page - 1) * limit;

    const {
      status = 'all',           // 'all' | 'approved' | 'pending' | 'rejected'
      needsReply,               // 'true' | 'false'
      minRating,
      maxRating,
      sort = 'newest',          // 'newest' | 'oldest' | 'lowest' | 'highest'
    } = req.query;

    const q = { doctorId };
    if (status !== 'all') q.status = status;

    if (needsReply === 'true') q['doctor_reply.text'] = { $exists: false };
    if (needsReply === 'false') q['doctor_reply.text'] = { $exists: true };

    if (minRating || maxRating) {
      q.rating_overall = {};
      if (minRating) q.rating_overall.$gte = Number(minRating);
      if (maxRating) q.rating_overall.$lte = Number(maxRating);
    }

    const sortMap = {
      newest:  { createdAt: -1 },
      oldest:  { createdAt: 1 },
      lowest:  { rating_overall: 1, createdAt: -1 },
      highest: { rating_overall: -1, createdAt: -1 },
    };

    const [items, total] = await Promise.all([
  Review.find(q)
    .sort(sortMap[sort] || sortMap.newest)
    .skip(skip)
    .limit(limit)
    .populate({
      path: 'patientId',       // field in Review model
      select: 'name profilePicture', // only send required fields
    })
    .lean(),
  Review.countDocuments(q),
]);


    return res.json({ items, total, page, limit });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Server error' });
  }
};




module.exports = {
  registerDoctor, resendDoctorOtp, verifyDoctorOtpAndRegister, doctorAvailability, getDoctorAnalytics,
  getDoctorDetails, updateAppointmentStatus, getDoctorAvailability, getDoctorDashboardSummary, getTodayAppointments, listMyDoctorReviews
};

