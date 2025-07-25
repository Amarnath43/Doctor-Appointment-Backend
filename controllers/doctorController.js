const Doctor = require('../models/doctorModel');
const User = require('../models/userModel');
const Fuse = require('fuse.js');
const mongoose = require('mongoose');
const Hospital = require('../models/hospitalModel');
const Appointment=require('../models/appointmentModel')


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

const doctorAvailabilty = async (req, res) => {
    try {
        const doctorId = req.user._id;
        const availabilty = req.body;

        const doctor = await Doctor.findOne({userId:doctorId});
        if (!doctor) {
            return res.status(404).json({ message: "doctor not found" });
        }

        availabilty.forEach(({ date, slots }) => {
            const existingAvailability = doctor.availability.find(
                a => a.date.toISOString().split('T')[0] === new Date(date).toISOString().split('T')[0]
            );


            if (existingAvailability) {
                existingAvailability.slots = slots;
            }
            else {
                doctor.availability.push({ date, slots })
            }
        })

        await doctor.save();
        res.status(200).json({ message: 'Availability updated successfully', doctor });
    }
    catch (err) {
        console.error('Error updating availability:', err);
        res.status(500).json({ message: 'Server error' });
    }
}

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

const existingDoctorSlots=async(req,res)=>{
  try{
    const id=req.user._id;
    const doctor=await Doctor.findOne({userId:id});
    const availability = doctor.availability.map(a => ({
      date:  a.date.toISOString().split('T')[0],
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
        const doctor=await Doctor.findById(doctorId).populate({
          path:'userId',
          select:'name email phone profilePicture'
        }).populate({
          path:'hospital',
          select:'name location'
        }).lean();
    
         if (!doctor) {
          return res.status(404).json({ message: 'Doctor not found' });
        }

    const now       = new Date();
    const todayMid  = new Date(now).setHours(0, 0, 0, 0);
    const todayStr  = now.toISOString().split('T')[0];
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    doctor.availability = (doctor.availability || [])
      // 1) keep only today+future dates
      .filter(a => {
        const dayMid = new Date(a.date).setHours(0,0,0,0);
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

module.exports = { registerDoctor, doctorAvailabilty, getDoctorAnalytics, existingDoctorSlots,getDoctorDetails, updateAppointmentStatus };

