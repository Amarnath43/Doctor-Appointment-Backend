const Appointment = require('../models/appointmentModel');
const Doctor = require('../models/doctorModel')
const mongoose = require('mongoose')

const bookAppointment = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { doctorId, date, slot } = req.body;
    const userId = req.user._id;
    const dateStr = new Date(date).toISOString().split('T')[0];

    // 1) Remove the slot
    const pullRes = await Doctor.updateOne(
      { _id: doctorId, 'availability.date': dateStr },
      { $pull: { 'availability.$.slots': slot } },
      { session }
    );
    if (pullRes.modifiedCount === 0) {
      throw { status: 409, message: 'Slot already booked' };
    }

    // 2) Create the appointment
    const appointment = new Appointment({
      userId, doctorId, date: new Date(date), slot, status: 'Confirmed'
    });
    await appointment.save({ session });

     // 3) Commit the transaction
    await session.commitTransaction();
    session.endSession();
const fullAppt = await Appointment
  .findById(appointment._id)
  .populate({
    path:   'doctorId',
    select: 'userId specialization fee profilePicture hospitalId',
    populate: [
      // 1) Load doctor.userId
      { path: 'userId',     select: 'name' },
      // 2) Load doctor.hospitalId
      { path: 'hospital', select: 'name location googleMapsLink' }
    ]
  })

    return res.status(201).json({ message: 'Booked!', fullAppt });
    
  } catch (err) {
    // Abort both operations
    console.log(err)
     if (session.inTransaction()) {
      await session.abortTransaction();
    }
    session.endSession();

    if (err.status === 409) {
      return res.status(409).json({ message: err.message });
    }
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};
const cancelAppointment = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {

    const appointmentId = req.params.id;
    const userId = req.user._id;
    const role = req.user.role;

    // 1) Load the appointment under session
    const appointment = await Appointment.findById(appointmentId).session(session);
    if (!appointment) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Appointment not found" });
    }

    // 2) Authorization checks
    if (role === 'user' && appointment.userId.toString() !== userId.toString()) {
      await session.abortTransaction();
      return res.status(403).json({ message: "You cannot cancel others' appointments" });
    }
    if (role === 'doctor') {
      const doctor = await Doctor.findOne({ userId }).session(session);
      if (!doctor || appointment.doctorId.toString() !== doctor._id.toString()) {
        await session.abortTransaction();
        return res.status(403).json({ message: "You cannot cancel others' appointments" });
      }
    }
    // (admin skip)

    // 3) Mark the appointment cancelled
    appointment.status = 'Cancelled';
    await appointment.save({ session });

    // 4) Restore the slot into the Doctor.availability
    const dateStr = appointment.date.toISOString().split('T')[0];
    const dateOnly = new Date(dateStr + 'T00:00:00.000Z');

  const result=  await Doctor.updateOne(
  { _id: appointment.doctorId, 'availability.date': dateOnly },
  {
    $push: {
      'availability.$.slots': {
        $each: [appointment.slot],
        $sort: 1        // ascending; for descending use -1
      }
    }
  },
  { session }
);

    console.log(result)
    // (optional) check addRes.modifiedCount if you expect the date subdoc to always exist

    // 5) Commit both operations
    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      message: "Appointment cancelled successfully; slot restored.",
      appointment
    });
  } catch (err) {
    // Roll everything back
    await session.abortTransaction();
    session.endSession();
    console.error("Error cancelling appointment:", err);
    res.status(500).json({ message: "Server error" });
  }
};

const myAppointments = async (req, res) => {
  try {
    const userId = req.user._id;
    const appointments = await Appointment.find({ userId }).populate('doctorId', '-password').sort({ date: 1 })

    res.status(200).json(appointments);
  }
  catch (err) {
    console.error("Error fetching appointments:", err);
    res.status(500).json({ message: "Server error while fetching appointments" });
  }

}




const getDoctorAppointments = async (req, res) => {
  try {
    const APPOINTMENTS_PER_PAGE = 10;
    const doctorUserId = req.user._id;

    const doctor = await Doctor.findOne({ userId: doctorUserId });
    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }

    const {
      startDate,
      endDate,
      status,
      search,
      page = 1
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10));
    const pageSize = APPOINTMENTS_PER_PAGE;

    const matchStage = {
      doctorId: doctor._id
    };

    if (startDate || endDate) {
  matchStage.date = {};
  if (startDate) matchStage.date.$gte = new Date(startDate);
  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    matchStage.date.$lte = end;
  }
}


    if (status) {
  const statuses = status.split(',').map(s => s.trim()).filter(Boolean);
  if (statuses.length > 0) {
    matchStage.status = { $in: statuses };
  }
}
    const searchClauses = [];
    if (search) {
      const regex = new RegExp(search, 'i');
      searchClauses.push({ 'patient.name': { $regex: regex } });
    }



    const pipeline = [
      { $match: matchStage },
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'patient'
        }
      },
      { $unwind: '$patient' },
      ...(searchClauses.length ? [{ $match: { $or: searchClauses } }] : []),
      { $sort: { date: -1, slot: -1 } },
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
                patientName: '$patient.name'
              }
            }
          ]
        }
      }
    ];

    const [result] = await Appointment.aggregate(pipeline);
    const data = result.data;
    const totalCount = result.metadata[0]?.total || 0;
    const totalPages = Math.ceil(totalCount / pageSize);

    return res.json({
      data,
      pagination: {
        totalCount,
        pageSize,
        currentPage: pageNum,
        totalPages
      }
    });

  } catch (err) {
    console.error('Error in getDoctorAppointments:', err);
    return res.status(500).json({ message: 'Server error while fetching appointments' });
  }
};



const getAllAppointments = async (req, res) => {
  try {
    const allAppointments = await Appointment.find({}).populate('userId', '-password').populate({ path: 'doctorId', populate: { path: 'userId', select: '-password' } }).sort({ date: 1 })
    res.status(200).json(allAppointments);


  }
  catch (err) {
    console.error("Error fetching appointments:", err);
    res.status(500).json({ message: "Server error while fetching all appointments(admin" });
  }

}


const rescheduleAppointment = async (req, res) => {
  try {
    const appointmentId = req.params.id;
    const { newDate, newSlot } = req.body;
    const userId = req.user._id;

    const appointment = await Appointment.findById(appointmentId);
    if (!appointment) {
      return res.status(404).json({ message: "Appointment not found" });
    }

    if (req.user.role === 'user') {
      if (!(appointment.userId.toString() === userId.toString())) {
        return res.status(403).json({ message: "you cannot reschedule someone else appointment" });
      }

    }

    if (req.user.role === 'doctor') {
      const doctor = await Doctor.findOne({ userId: userId });
      if (!doctor || appointment.doctorId.toString() !== doctor._id.toString()) {
        return res.status(403).json({ message: "you cannot reschedule some other doctor appointment" });
      }
    }

    const doctor = await Doctor.findById(appointment.doctorId);

    const availableDate = doctor.availability.find(a => a.date.toISOString().split('T')[0] === new Date(newDate).toISOString().split('T')[0])

    if (!availableDate) {
      return res.status(404).json({ message: "Selected Date is not available for booking" });
    }
    if (!availableDate.slots.includes(newSlot)) {
      return res.status(400).json({ message: "Selected slot is already booked" });
    }

    const existingAvailability = await Appointment.findOne({
      doctorId: doctor._id,
      date: new Date(newDate),
      slot: newSlot,
      status: 'confirmed'
    });

    if (existingAvailability) {
      return res.status(400).json({ message: "Slot already booked by someone else" });
    }

    const newAppointment = new Appointment({
      userId: appointment.userId,
      doctorId: appointment.doctorId,
      date: new Date(newDate),
      slot: newSlot
    });
    await newAppointment.save();

    appointment.status = 'Cancelled'
    await appointment.save();
    res.status(200).json({ message: "Appointment rescheduled successfully", newAppointment });

  }
  catch (err) {
    console.error("Error rescheduling appointment:", err);
    res.status(500).json({ message: "Server error while rescheduling appointment" });
  }

}

const getAppointmentDetails=async(req,res)=>{
  try
  {
     const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid appointment ID' });
    }

    // find the appointment, populate doctor → (user & hospital) and patient user
    const appointment = await Appointment.findById(id)
      .populate({
        path: 'doctorId',
        select: 'userId specialization hospitalId fee',
        populate: [
          { path: 'userId',     select: 'name email profilePicture' },
          { path: 'hospital', select: 'name location phoneNumber googleMapsLink' }
        ]
      })

      console.log(appointment)
      

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    res.json({ appointment });
  }
  catch (err) {
    console.error("Error fetching appointment details", err);
    res.status(500).json({ message: "Server error while Error fetching appointment details" });
  }
}


module.exports = { bookAppointment, cancelAppointment, myAppointments, getDoctorAppointments, getAllAppointments, rescheduleAppointment, getAppointmentDetails};