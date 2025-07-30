const Doctor = require('../models/doctorModel');
const User = require('../models/userModel');
const Fuse = require('fuse.js');
const mongoose = require('mongoose');
const Hospital = require('../models/hospitalModel');
const Appointment = require('../models/appointmentModel')
const generateOTP = require('../utils/generateOTP')
const redis = require('../utils/redis');
const sendEmail = require('../utils/mailer');
const bcrypt = require('bcryptjs');
const getNextAvailableSlot = require('../utils/getNextAvailableSlot');
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


const sendDoctorOtp = async (req, res) => {
  const formData = req.body;
  const { email,phone } = formData;

  if (!email) {
    return res.status(400).json({ field: 'email', message: 'Email is required' });
  }

  const existingUser = await User.findOne({$or:[{email},{phone}]})
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
      otp:hashedOtp,
      otpExpiry: now + 10 * 60 * 1000, // 10 mins
      lastOtpSentAt: now
    };

    await redis.set(redisKey, JSON.stringify(updatedFormData), { EX: 600 });

    await sendEmail(
      email, otp
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
    const hashedOTP=await bcrypt.hash(newOtp,10);
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
  let session;

  try {
    const redisKey = `register:doctor:data:${email}`;
    const formDataStr = await redis.get(redisKey);
    console.log(formDataStr)

    if (!formDataStr) {
      return res.status(400).json({ message: 'Form session expired. Please re-submit.' });
    }

    const formData = JSON.parse(formDataStr);
    const { otp: storedOtp, otpExpiry } = formData;

    if (!storedOtp || !otpExpiry || Date.now() > otpExpiry) {
      return res.status(400).json({ message: 'OTP expired. Please request a new one.' });
    }

    const match=await bcrypt.compare(otp, storedOtp)
    if (!match) {
      return res.status(400).json({ message: 'Invalid OTP.' });
    }

    await redis.del(redisKey); // cleanup

    const {
      name, phone, password, specialization, experience,
      hospitalName, location, googleMapsLink, hospitalPhoneNumber,
      fee, bio
    } = formData;

    session = await mongoose.startSession();
    session.startTransaction();

    // Hospital logic
    let hospital = await Hospital.findOne({ name: { $regex: `^${hospitalName}$`, $options: 'i' } }).session(session);
    if (!hospital) {
      const allHospitals = await Hospital.find();
      const fuse = new Fuse(allHospitals, { keys: ['name', 'location'], threshold: 0.3 });
      const result = fuse.search(hospitalName);
      if (result.length > 0) hospital = result[0].item;
    }

    if (!hospital) {
      const created = await Hospital.create([{
        name: hospitalName,
        location,
        googleMapsLink,
        phoneNumber: hospitalPhoneNumber,
        createdByDoctor: true
      }], { session });
      hospital = created[0];
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      name,
      email,
      phone,
      password: hashedPassword,
      role: 'doctor',
      isVerified: true
    });
    newUser._passwordIsHashed = true;

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

  } catch (err) {
    console.error('verifyDoctorOtpAndRegister error:', err);
    if (session) {
      await session.abortTransaction();
      session.endSession();
    }
    res.status(500).json({ message: 'Server error during OTP verification or registration.' });
  }
};


const doctorAvailability = async (req, res) => {
  try {
    const doctorId = req.user._id;
    const availabilityUpdates = req.body;

    const doctor = await Doctor.findOne({ userId: doctorId });
    if (!doctor) {
      return res.status(404).json({ message: "Doctor not found" });
    }

    // Update or add availability entries
    availabilityUpdates.forEach(({ date, slots }) => {
      const formattedDate = new Date(date).toISOString().split('T')[0];

      const existing = doctor.availability.find(
        (entry) => new Date(entry.date).toISOString().split('T')[0] === formattedDate
      );

      const cleanedSlots = slots.map(slot => slot.trim()).sort();

      if (existing) {
        existing.slots = cleanedSlots;
      } else {
        doctor.availability.push({ date: formattedDate, slots: cleanedSlots });
      }
    });

    // Filter past dates and empty slots
    const now = new Date();
    doctor.availability = doctor.availability
      .filter(entry =>
        new Date(entry.date) >= new Date(now.toDateString()) &&
        entry.slots.length > 0
      );

    // Sort by date
    doctor.availability.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Recalculate next slot
    doctor.nextAvailability = getNextAvailableSlot(doctor.availability);

    await doctor.save();

    res.status(200).json({
      message: 'Availability updated successfully',
      doctor
    });

  } catch (err) {
    console.error('Error updating availability:', err);
    res.status(500).json({ message: 'Server error' });
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

    const appointment = await Appointment.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    );

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    res.json({ message: 'Status updated', appointment });
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { sendDoctorOtp, resendDoctorOtp, verifyDoctorOtpAndRegister, doctorAvailability, getDoctorAnalytics, existingDoctorSlots, getDoctorDetails, updateAppointmentStatus };

