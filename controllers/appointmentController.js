const Appointment = require('../models/appointmentModel');
const Doctor = require('../models/doctorModel');
const mongoose = require('mongoose');
const getNextAvailableSlot = require('../utils/getNextAvailableSlot');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
dayjs.extend(utc);
dayjs.extend(timezone);
const mergeSlotToDateArray = require('../utils/mergeSlotToDateArray')
const {
  sendAppointmentBookedEmail,
  sendAppointmentCancelledEmail,
  sendAppointmentRescheduledEmail,
  sendDoctorAppointmentBookedEmail,
  sendDoctorAppointmentCancelledEmail,
  sendDoctorAppointmentRescheduledEmail,
  safeSend, } = require('../emails/appointments'); // <- from earlier



const bookAppointment = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { doctorId, date, slot } = req.body;
    const userId = req.user._id;

    const doctor = await Doctor.findById(doctorId).session(session);
    if (!doctor) {
      await session.abortTransaction(); return res.status(404).json({ message: 'Doctor not found' });
    }

    // Build an **IST instant**, then convert to **UTC** (we store/compare UTC)
    const istDateTime = dayjs.tz(`${date} ${slot}`, 'YYYY-MM-DD HH:mm', 'Asia/Kolkata');
    const utcInstant = istDateTime.utc(); // dayjs (UTC)
    const utcDate = utcInstant.toDate();  // Date

    // compare UTC↔UTC (server agnostic)
    if (!utcInstant.isAfter(dayjs.utc())) {
      await session.abortTransaction(); return res.status(400).json({ message: 'Slot is in the past' });
    }

    // check availability by calendar day in IST (your UI supplies IST)
    const entry = doctor.availability.find(d =>
      dayjs.utc(d.date).tz('Asia/Kolkata').format('YYYY-MM-DD') === date
    );
    if (!entry || !entry.slots.includes(slot)) {
      await session.abortTransaction(); return res.status(409).json({ message: 'Slot not available' });
    }

    // remove booked slot
    entry.slots = entry.slots.filter(s => s !== slot);
    doctor.availability = doctor.availability.filter(e => e.slots.length > 0);
    doctor.nextAvailability = getNextAvailableSlot(doctor.availability);
    await doctor.save({ session });


    const [appointment] = await Appointment.create([{
      userId,
      doctorId,
      date: utcDate, // full UTC datetime
      slot,          // keep for convenience
      status: 'Confirmed',
    }], { session });

    await session.commitTransaction();
    session.endSession();

    // populate for response & emails
    const fullAppt = await Appointment.findById(appointment._id)
      .populate({
        path: 'doctorId',
        select: 'userId specialization fee profilePicture hospital',
        populate: [
          { path: 'userId', select: 'name email' },
          { path: 'hospital', select: 'name location googleMapsLink' },
        ],
      })
      .populate({ path: 'userId', select: 'name email' });

    const slotISO = dayjs(utcDate).toISOString();
    const patientEmail = fullAppt.userId?.email;
    const patientName = fullAppt.userId?.name || 'there';
    const doctorName = fullAppt.doctorId?.userId?.name || 'your doctor';
    const hospitalName = fullAppt.doctorId?.hospital?.name || 'Hospital';

    if (patientEmail) {
      sendAppointmentBookedEmail(patientEmail, {
        patientName,
        doctorName,
        hospitalName,
        slotISO,            // UTC ISO
        tz: 'Asia/Kolkata',
        appointmentId: String(fullAppt._id),
      }).catch(console.error);
    }

    const docEmail = fullAppt.doctorId?.userId?.email;
    if (docEmail) {
      sendDoctorAppointmentBookedEmail(docEmail, {
        patientName,
        doctorName,
        hospitalName,
        slotISO,
        tz: 'Asia/Kolkata',
        appointmentId: String(fullAppt._id),
      }).catch(console.error);
    }

    return res.status(201).json({ message: 'Booked!', fullAppt });
  } catch (err) {
    await session.abortTransaction(); session.endSession(); 
    if (err.code === 11000) {
      return res.status(409).json({ message: 'That slot was just taken. Please pick another.' });
    }
    console.error('Booking error:', err);
    return res.status(500).json({ message: 'Booking failed' });
  }
};


const cancelAppointment = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const appointmentId = req.params.id;
    const userId = req.user._id;
    const role = req.user.role;

    const appointment = await Appointment.findById(appointmentId).session(session);
    if (!appointment) {
      await session.abortTransaction(); return res.status(404).json({ message: 'Appointment not found' });
    }

    if (appointment.status === 'Cancelled') {
      await session.abortTransaction(); return res.status(409).json({ message: 'Appointment already cancelled' });
    }

    // auth
    if (role === 'user' && String(appointment.userId) !== String(userId)) {
      await session.abortTransaction(); return res.status(403).json({ message: "You can't cancel others' appointments" });
    }
    if (role === 'doctor') {
      const doctorForUser = await Doctor.findOne({ userId }).session(session);
      if (!doctorForUser || String(appointment.doctorId) !== String(doctorForUser._id)) {
        await session.abortTransaction(); return res.status(403).json({ message: "You can't cancel others' appointments" });
      }
    }

    // cancel
    appointment.status = 'Cancelled';
    await appointment.save({ session });

    // restore slot (future slots -> availability, past -> pastAvailability)
    const doctor = await Doctor.findById(appointment.doctorId).session(session);

    // Use UTC instant stored, transform to IST calendar for the slot label date
    const instUTC = dayjs.utc(appointment.date);
    const dateStrIST = instUTC.tz('Asia/Kolkata').format('YYYY-MM-DD');
    const slotInstantIST = dayjs.tz(`${dateStrIST} ${appointment.slot}`, 'YYYY-MM-DD HH:mm', 'Asia/Kolkata');

    if (slotInstantIST.utc().isAfter(dayjs.utc())) {
      mergeSlotToDateArray(doctor.availability, dateStrIST, appointment.slot);
    } else {
      mergeSlotToDateArray(doctor.pastAvailability, dateStrIST, appointment.slot);
    }

    doctor.availability = doctor.availability.filter(e => e.slots.length > 0);
    doctor.availability.sort((a, b) => a.date - b.date);
    doctor.nextAvailability = getNextAvailableSlot(doctor.availability);
    await doctor.save({ session });

    await session.commitTransaction();
    session.endSession();

    // emails after commit
    const populated = await Appointment.findById(appointment._id)
      .populate({ path: 'userId', select: 'name email' })
      .populate({
        path: 'doctorId',
        select: 'userId hospital',
        populate: [
          { path: 'userId', select: 'name email' },
          { path: 'hospital', select: 'name location googleMapsLink' },
        ],
      });

    const patientEmail = populated.userId?.email;
    const patientName = populated.userId?.name || 'there';
    const doctorEmail = populated.doctorId?.userId?.email;
    const doctorName = populated.doctorId?.userId?.name || 'Doctor';
    const hospitalName = populated.doctorId?.hospital?.name || 'Hospital';
    const slotISO = dayjs(appointment.date).toISOString();

    if (patientEmail) {
      sendAppointmentCancelledEmail(patientEmail, {
        patientName,
        doctorName,
        slotISO,
        tz: 'Asia/Kolkata',
      }).catch(console.error);
    }
    if (doctorEmail) {
      sendDoctorAppointmentCancelledEmail(doctorEmail, {
        patientName,
        doctorName,
        slotISO,
        tz: 'Asia/Kolkata',
      }).catch(console.error);
    }

    return res.status(200).json({
      message: 'Appointment cancelled; slot restored/archived.',
      appointment: populated,
    });
  } catch (err) {
    try { await session.abortTransaction(); session.endSession(); } catch (_) { }
    console.error('Error cancelling appointment:', err);
    return res.status(500).json({ message: 'Server error' });
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
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const appointmentId = req.params.id;
    const { newDate, newSlot } = req.body;
    const userId = req.user._id;

    const appointment = await Appointment.findById(appointmentId).session(session);
    if (!appointment) {
      await session.abortTransaction(); return res.status(404).json({ message: 'Appointment not found' });
    }

    // auth
    if (req.user.role === 'user' && String(appointment.userId) !== String(userId)) {
      await session.abortTransaction(); return res.status(403).json({ message: 'You cannot reschedule someone else’s appointment' });
    }
    if (req.user.role === 'doctor') {
      const doc = await Doctor.findOne({ userId }).session(session);
      if (!doc || String(appointment.doctorId) !== String(doc._id)) {
        await session.abortTransaction(); return res.status(403).json({ message: 'You cannot reschedule another doctor’s appointment' });
      }
    }

    const doctor = await Doctor.findById(appointment.doctorId).session(session);

    // new IST -> UTC
    const newIST = dayjs.tz(`${newDate} ${newSlot}`, 'YYYY-MM-DD HH:mm', 'Asia/Kolkata');
    const newUTC = newIST.utc();

    if (!newUTC.isAfter(dayjs.utc())) {
      await session.abortTransaction(); return res.status(400).json({ message: 'Slot is in the past' });
    }

    // must exist in availability (by IST day and slot)
    const availOnDay = doctor.availability.find(
      d => dayjs.utc(d.date).tz('Asia/Kolkata').format('YYYY-MM-DD') === newDate
    );
    if (!availOnDay || !availOnDay.slots.includes(newSlot)) {
      await session.abortTransaction(); return res.status(400).json({ message: 'Selected slot is not available' });
    }

    // check not already taken
    const slotTaken = await Appointment.findOne({
      doctorId: doctor._id,
      date: newUTC.toDate(),
      slot: newSlot,
      status: 'Confirmed',
    }).session(session);
    if (slotTaken) {
      await session.abortTransaction(); return res.status(400).json({ message: 'Slot already booked by someone else' });
    }

    // remove new slot from availability
    availOnDay.slots = availOnDay.slots.filter(s => s !== newSlot);
    doctor.availability = doctor.availability.filter(e => e.slots.length > 0);

    // cancel old appointment and restore its slot
    const oldUTC = dayjs.utc(appointment.date);
    const oldISTDateStr = oldUTC.tz('Asia/Kolkata').format('YYYY-MM-DD');
    const oldSlot = appointment.slot;
    appointment.status = 'Cancelled';
    await appointment.save({ session });

    // where to put old slot (future vs past based on UTC now)
    const oldSlotInstantIST = dayjs.tz(`${oldISTDateStr} ${oldSlot}`, 'YYYY-MM-DD HH:mm', 'Asia/Kolkata');
    if (oldSlotInstantIST.utc().isAfter(dayjs.utc())) {
      mergeSlotToDateArray(doctor.availability, oldISTDateStr, oldSlot);
    } else {
      mergeSlotToDateArray(doctor.pastAvailability, oldISTDateStr, oldSlot);
    }

    doctor.availability = doctor.availability.filter(e => e.slots.length > 0);
    doctor.availability.sort((a, b) => a.date - b.date);
    doctor.nextAvailability = getNextAvailableSlot(doctor.availability);
    await doctor.save({ session });

    // make new appointment
    const [newAppt] = await Appointment.create([{
      userId: appointment.userId,
      doctorId: appointment.doctorId,
      date: newUTC.toDate(),
      slot: newSlot,
      status: 'Confirmed',
    }], { session });

    await session.commitTransaction();
    session.endSession();

    // emails (after commit)
    const populatedNew = await Appointment.findById(newAppt._id)
      .populate({ path: 'userId', select: 'name email' })
      .populate({
        path: 'doctorId',
        select: 'userId hospital',
        populate: [
          { path: 'userId', select: 'name email' },
          { path: 'hospital', select: 'name location googleMapsLink' },
        ],
      });

    const pEmail = populatedNew.userId?.email;
    const pName = populatedNew.userId?.name || 'there';
    const dEmail = populatedNew.doctorId?.userId?.email;
    const dName = populatedNew.doctorId?.userId?.name || 'Doctor';

    const oldISO = oldUTC.toISOString();
    const newISO = dayjs(newAppt.date).toISOString();

    if (pEmail) {
      sendAppointmentRescheduledEmail(pEmail, {
        patientName: pName,
        doctorName: dName,
        oldSlotISO: oldISO,
        newSlotISO: newISO,
        tz: 'Asia/Kolkata',
        appointmentId: String(newAppt._id),
      }).catch(console.error);
    }
    if (dEmail) {
      sendDoctorAppointmentRescheduledEmail(dEmail, {
        patientName: pName,
        doctorName: dName,
        oldSlotISO: oldISO,
        newSlotISO: newISO,
        tz: 'Asia/Kolkata',
        appointmentId: String(newAppt._id),
      }).catch(console.error);
    }

    res.status(200).json({
      message: 'Appointment rescheduled successfully',
      newAppointment: populatedNew,
    });
  } catch (err) {
    try { await session.abortTransaction(); session.endSession(); } catch (_) { }
    console.error('Error rescheduling appointment:', err);
    res.status(500).json({ message: 'Server error while rescheduling appointment' });
  }
};

const getAppointmentDetails = async (req, res) => {
  try {
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
          { path: 'userId', select: 'name email profilePicture' },
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




module.exports = {
  bookAppointment, cancelAppointment, myAppointments, getDoctorAppointments, getAllAppointments,
  rescheduleAppointment, getAppointmentDetails
};