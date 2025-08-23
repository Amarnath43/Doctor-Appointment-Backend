const User = require('../models/userModel')
const Doctor = require('../models/doctorModel');
const Hospital = require('../models/hospitalModel');
const Appointment = require('../models/appointmentModel');
const Admin = require('../models/admin');
const bcrypt = require('bcryptjs');
const dayjs = require('dayjs');
const fs = require('fs');
const path = require('path');
const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
const {s3} = require('../utils/s3Client');


const getPendingDoctors = async (req, res) => {
  try {
    const pendingDoctors = await Doctor.find({ status: 'pending' }).populate('userId', '-password').populate('hospital');
    res.json(pendingDoctors)
  }
  catch (err) {
    console.error('server error:', err);
    res.status(500).json({ message: 'error from admin panel-server issue' });
  }
}


const updateDoctorStatus = async (req, res) => {
  try {
    const doctorId = req.params.id;
    const { status } = req.body;
    console.log(req.params, status)
    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      return res.status(404).json({ message: "Doctor not found" })
    }

    doctor.status = status;
    await doctor.save();
    await User.findByIdAndUpdate(doctor.userId, { status: status })
    return res.status(200).json({ message: "Doctor status updated successfully" });
  }
  catch (err) {
    console.error('server error:', err);
    res.status(500).json({ message: 'error from admin panel-server issue(upds)' });
  }

}


const getAllActiveDoctors = async (req, res) => {
  try {
    const doctors = await Doctor.find({ status: 'active' }).populate('userId', '-password');
    res.status(200).json(doctors);
  } catch (err) {
    console.error('Error fetching active doctors:', err);
    res.status(500).json({ message: 'Server error' });
  }
};


const getAllPatients = async (req, res) => {
  try {
    const users = await User.find({ role: 'user', status: 'active' }).select('-password');
    res.status(200).json(users);
  }
  catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ message: 'Server error' });
  }
}

const getBlockedPatients = async (req, res) => {
  try {
    const users = await User.find({ role: 'user', status: 'blocked' }).select('-password');
    res.status(200).json(users);
  } catch (err) {
    console.error('Error fetching blocked patients:', err);
    res.status(500).json({ message: 'Server error while fetching blocked patients' });
  }
};


const getBlockedDoctors = async (req, res) => {
  try {
    const doctors = await Doctor.find({ status: 'blocked' }).populate('userId', '-password');
    res.status(200).json(doctors);
  } catch (err) {
    console.error('Error fetching blocked doctors:', err);
    res.status(500).json({ message: 'Server error while fetching blocked doctors' });
  }
};

const updateUserStatus = async (req, res) => {
  try {
    const userId = req.params.id;
    const { status } = req.body;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }

    user.status = status;
    await user.save();
    return res.status(200).json({ message: "User status updated successfully" });
  }
  catch (err) {
    console.error('server error:', err);
    res.status(500).json({ message: 'error from admin panel-server issue(user status update)' });
  }
}

const updateHospitalStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const hospitalId = req.params.id
    const hospital = await Hospital.findById(hospitalId);
    if (!hospital) {
      return res.status(404).json({ message: 'Hospital not found' });
    }

    hospital.status = status;
    await hospital.save();
    return res.status(200).json({ message: "Hospital status updated successfully" });
  }
  catch (err) {
    console.error('server error:', err);
    res.status(500).json({ message: 'error from admin panel-server issue(hosp status update)' });
  }
}


const getPendingHospitals = async (req, res) => {
  try {
    const pendingHospitals = await Hospital.find({ status: 'pending' });
    return res.status(200).json(pendingHospitals);
  }
  catch (err) {
    console.error('server error:', err);
    res.status(500).json({ message: 'Unable to fetch hospital pending data' });
  }
}




const adminDashboardStats = async (req, res) => {
  try {

    const totalAppointments = await Appointment.countDocuments();
    const cancelledAppointments = await Appointment.countDocuments({ status: 'Cancelled' });
    const completedAppointments = await Appointment.countDocuments({ status: 'Completed' });



    const totalUsers = await User.countDocuments({ role: 'user' });
    const activeUsers = await User.countDocuments({ role: 'user', status: 'active' })
    const blockedUsers = await User.countDocuments({ role: 'user', status: 'blocked' });

    const totalDoctors = await Doctor.countDocuments();
    const activeDoctors = await Doctor.countDocuments({ status: 'active' });
    const blockedDoctors = await Doctor.countDocuments({ status: 'blocked' });


    const stats = {

      totalAppointments,
      completedAppointments,
      cancelledAppointments,

      totalUsers,
      activeUsers,
      blockedUsers,


      totalDoctors,
      activeDoctors,
      blockedDoctors
    };

    res.status(200).json(stats);
  }
  catch (err) {
    console.error('server error:', err);
    res.status(500).json({ message: 'error from admin dashboard)' });
  }

}

const getAllUsers = async (req, res) => {
  try {
    const { role, search, page = 1, limit = 10 } = req.query;

    const query = {};

    if (role && role !== 'all') {
      query.role = role;
    }

    if (search) {
      query.$or = [
        { name: new RegExp(search, 'i') },
        { email: new RegExp(search, 'i') },
        { phone: new RegExp(search, 'i') }
      ];
    }

    const users = await User.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit)).lean();

    const enrichedUsers = await Promise.all(
      users.map(async (user) => {
        if (user.role === 'doctor') {
          const doctor = await Doctor.findOne({ userId: user._id }).lean();
          return {
            ...user,
            doctorStatus: doctor?.status || 'pending', // fallback
            doctorId: doctor?._id || null
          };
        }
        return { ...user, doctorStatus: null }; // for non-doctors
      })
    );

    res.status(200).json(enrichedUsers);
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ message: 'Server error while fetching users' });
  }
};


const addHospital = async (req, res) => {
  try {
    const { name, location, googleMapsLink, phoneNumber } = req.body;

    if (!name || !location || !googleMapsLink || !phoneNumber) {
      return res.status(400).json({ message: "All fields are required." });
    }

    const newHospital = new Hospital({
      name,
      location,
      googleMapsLink,
      phoneNumber,
      createdByDoctor: false, // or true if from doctor side
      status: 'pending'
    });

    await newHospital.save();
    res.status(201).json({ success: true, hospital: newHospital });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getAllHospitals = async (req, res) => {
  try {
    const hospitals = await Hospital.find().sort({ createdAt: -1 });
    res.status(200).json(hospitals);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


const updateHospital = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ID format
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: 'Invalid hospital ID' });
    }

    const updated = await Hospital.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: true
    });

    if (!updated) {
      return res.status(404).json({ message: 'Hospital not found' });
    }

    res.status(200).json({
      success: true,
      message: 'Hospital updated successfully',
      hospital: updated
    });
  } catch (err) {
    console.error('Update hospital error:', err.message);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};



// Utility: extract S3 key from full image URL
const extractS3Key = (url) => {
  const parts = url.split('/');
  return parts.slice(-2).join('/'); // e.g., 'hospitals/image123.jpg'
};
const deleteHospitalImage = async (req, res) => {
  const { url, hospitalId } = req.body;

  if (!url || !hospitalId) {
    return res.status(400).json({ message: 'Missing image URL or hospital ID' });
  }

  try {
    const hospital = await Hospital.findById(hospitalId);
    if (!hospital) {
      return res.status(404).json({ message: 'Hospital not found' });
    }

    // 1. Remove image from DB array
    hospital.images = hospital.images.filter(img => img !== url);
    await hospital.save();

    // 2. Delete from S3
    const key = extractS3Key(url);

    const deleteCommand = new DeleteObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key
    });

    await s3.send(deleteCommand);

    return res.status(200).json({ message: 'Image deleted from hospital and S3' });
  } catch (err) {
    console.error('Error deleting hospital image from S3:', err);
    res.status(500).json({ message: 'Failed to delete image from S3' });
  }
};


const deleteHospital = async (req, res) => {
  try {
    const hospitalId = req.params.id;
    const deleted = await Hospital.findByIdAndDelete(hospitalId)
    if (!deleted) {
      return res.status(404).json({ message: 'Hospital not found' });
    }

    return res.status(200).json({ message: 'Hospital deleted successfully' });
  }
  catch (err) {
    console.error('Error deleting hospital ', err);
    res.status(500).json({ message: 'Failed to delete hospital' });
  }
}


const getAdminAppointments = async (req, res) => {
  try {
    const APPTS_PER_PAGE = 10;
    const {
      startDate, endDate,
      status, search,
      page = 1, limit = APPTS_PER_PAGE
    } = req.query;
    console.log('→ status filter =', req.query.status);
    const pageNum = Math.max(1, parseInt(page, 10));
    const pageSize = Math.max(1, parseInt(limit, 10));

    // 1) Build the initial match filter
    const matchFilter = {};
    if (startDate || endDate) {
      matchFilter.date = {};
      if (startDate) matchFilter.date.$gte = new Date(startDate);
      if (endDate) matchFilter.date.$lte = new Date(endDate);
    }
    if (status) {
      matchFilter.status = { $in: status.split(',').map(s => s.trim()) };
    }


    // 2) Build the post-lookup search match (on patient or doctor name)
    const searchMatch = [];
    if (search) {
      const regex = new RegExp(search, 'i');
      searchMatch.push(
        { 'patient.name': { $regex: regex } },
        { 'doctorUser.name': { $regex: regex } }
      );
    }

    // 3) Aggregation pipeline
    const pipeline = [
      // initial date/status filter
      { $match: matchFilter },

      // join patient user
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'patient'
        }
      },
      { $unwind: '$patient' },

      // join doctor document
      {
        $lookup: {
          from: 'doctors',
          localField: 'doctorId',
          foreignField: '_id',
          as: 'doctor'
        }
      },
      { $unwind: '$doctor' },

      // join doctor’s user
      {
        $lookup: {
          from: 'users',
          localField: 'doctor.userId',
          foreignField: '_id',
          as: 'doctorUser'
        }
      },
      { $unwind: '$doctorUser' },

      // join hospital
      {
        $lookup: {
          from: 'hospitals',
          localField: 'doctor.hospital',
          foreignField: '_id',
          as: 'hospital'
        }
      },
      { $unwind: '$hospital' },

      // apply search if needed
      ...(searchMatch.length
        ? [{ $match: { $or: searchMatch } }]
        : []),

      // sort newest first
      { $sort: { date: -1, time: -1 } },

      // pagination + projection
      {
        $facet: {
          metadata: [{ $count: 'total' }],
          data: [
            { $skip: (pageNum - 1) * pageSize },
            { $limit: pageSize },
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
          ]
        }
      }
    ];

    // 4) Run it
    const [result] = await Appointment.aggregate(pipeline);

    const appointments = result.data;
    const totalCount = result.metadata[0]?.total || 0;

    // 5) Send back
    return res.json({
      data: appointments,
      pagination: {
        totalCount,
        currentPage: pageNum,
        pageSize,
        totalPages: Math.ceil(totalCount / pageSize)
      }
    });
  } catch (err) {
    console.error('Error in getAdminAppointments:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};


const getAdminDashboardSummary = async (req, res) => {
  try {

    const startOfDay = dayjs().tz('Asia/Kolkata').startOf('day').utc().toDate();
    const endOfDay = dayjs().tz('Asia/Kolkata').endOf('day').utc().toDate();

    const matchStage = {
      date: { $gte: startOfDay, $lte: endOfDay }
    };


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

    console.log(appointments + "sexy")

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
    console.log("hello")
    const { status, page = 1, limit = 10 } = req.query;

    const startOfDay = dayjs().tz('Asia/Kolkata').startOf('day').utc().toDate();
    const endOfDay = dayjs().tz('Asia/Kolkata').endOf('day').utc().toDate();

    const matchStage = {
      date: { $gte: startOfDay, $lte: endOfDay }
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



module.exports = {
  getBlockedDoctors, getPendingDoctors, getAllActiveDoctors, getAllPatients, updateDoctorStatus,
  getBlockedPatients, updateUserStatus, adminDashboardStats, updateHospitalStatus, getPendingHospitals,
  getAllUsers, addHospital, getAllHospitals, updateHospital, deleteHospitalImage, deleteHospital, getAdminAppointments,
  getAdminDashboardSummary, getTodayAppointments
}


