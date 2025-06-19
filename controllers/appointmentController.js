const Appointment = require('../models/appointmentModel');
const Doctor = require('../models/doctorModel')

const bookAppointment = async (req, res) => {
    try {
        const { doctorId, date, slot } = req.body;
        const userId = req.user._id;

        const doctor = await Doctor.findById(doctorId);
        if (!doctor) {
            return res.status(404).json({ message: "doctor not found" });
        }

        const availabilityDate = doctor.availability.find(a => a.date.toISOString().split('T')[0] === new Date(date).toISOString().split('T')[0])
        if (!availabilityDate) {
            return res.status(400).json({ message: "Doctor not available on selected date" });
        }

        if (!availabilityDate.slots.includes(slot)) {
            return res.status(400).json({ message: "Selected slot not available" });
        }

        const existingAvailability = await Appointment.findOne({
            slot,
            doctorId,
            date: new Date(date),
            status: 'confirmed'
        })
        if (existingAvailability) {
            return res.status(400).json({ message: "Slot already booked" });
        }

        const appointment = new Appointment({
            userId,
            doctorId,
            date: new Date(date),
            slot

        });

        await appointment.save();
        res.status(201).json({ message: "Appointment booked successfully", appointment });

    }
    catch (err) {
        console.error("Error booking appointment:", err);
        res.status(500).json({ message: "Server error" });
    }
};

const cancelAppointment = async (req, res) => {
  try {
    const appointmentId = req.params.id;
    const userId = req.user._id;
    const role = req.user.role;

    const appointment = await Appointment.findById(appointmentId);
    if (!appointment) {
      return res.status(404).json({ message: "Appointment not found" });
    }

    if (role === 'user') {
      if (appointment.userId.toString() !== userId.toString()) {
        return res.status(403).json({ message: "You cannot cancel others' appointments" });
      }
    }

    if (role === 'doctor') {
      const doctor = await Doctor.findOne({ userId });
      if (!doctor || appointment.doctorId.toString() !== doctor._id.toString()) {
        return res.status(403).json({ message: "You cannot cancel others' appointments" });
      }
    }

    // (optional) Admin can skip check

    appointment.status = 'cancelled';
    await appointment.save();

    res.status(200).json({ message: "Appointment cancelled successfully", appointment });

  } catch (err) {
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
        const doctorId = req.user._id;

        const doctor = await Doctor.findOne({ userId: doctorId });

        if (!doctor) {
            return res.status(404).json({ message: "Doctor not found" });
        }

        const appointments = await Appointment.find({ doctorId: doctor._id }).populate('userId', '-password').sort({ date: 1 })
        res.status(200).json(appointments);


    }
    catch (err) {
        console.error("Error fetching appointments:", err);
        res.status(500).json({ message: "Server error while fetching appointments" });
    }

}

const getAllAppointments = async (req, res) => {
    try {
        const allAppointments=await Appointment.find({}).populate('userId', '-password').populate({path:'doctorId',populate:{path: 'userId', select:'-password'}}).sort({date:1})
        res.status(200).json(allAppointments);


    }
    catch (err) {
        console.error("Error fetching appointments:", err);
        res.status(500).json({ message: "Server error while fetching all appointments(admin" });
    }

}


const rescheduleAppointment=async(req,res)=>{
    try
    {
        const appointmentId=req.params.id;
        const {newDate, newSlot}=req.body;
        const userId=req.user._id;

        const appointment=await Appointment.findById(appointmentId);
        if(!appointment)
        {
            return res.status(404).json({message:"Appointment not found"});
        }

        if(req.user.role==='user')
        {
            if(!(appointment.userId.toString()===userId.toString()))
            {
             return res.status(403).json({message:"you cannot reschedule someone else appointment"});
            }
           
        }

        if(req.user.role==='doctor')
        {
            const doctor=await Doctor.findOne({userId: userId});
            if(!doctor || appointment.doctorId.toString()!==doctor._id.toString())
            {
                 return res.status(403).json({message:"you cannot reschedule some other doctor appointment"});
            }
        }

        const doctor=await Doctor.findById(appointment.doctorId);

        const availableDate=doctor.availability.find(a=>a.date.toISOString().split('T')[0]===new Date(newDate).toISOString().split('T')[0])
       
        if(!availableDate)
        {
            return res.status(404).json({message:"Selected Date is not available for booking"});
        }
        if(!availableDate.slots.includes(newSlot))
        {
            return res.status(400).json({message:"Selected slot is already booked"});
        }

        const existingAvailability=await Appointment.findOne({
            doctorId: doctor._id,
            date: new Date(newDate),
            slot: newSlot,
            status: 'confirmed'
        });

        if(existingAvailability)
        {
             return res.status(400).json({ message: "Slot already booked by someone else" });
        }

        const newAppointment=new Appointment({
           userId: appointment.userId,
            doctorId: appointment.doctorId,
            date: new Date(newDate),
            slot: newSlot
        });
        await newAppointment.save();

        appointment.status='cancelled'
        await appointment.save();
        res.status(200).json({ message: "Appointment rescheduled successfully", newAppointment });

    }
    catch(err)
    {
        console.error("Error rescheduling appointment:", err);
        res.status(500).json({ message: "Server error while rescheduling appointment"});
    }

}




module.exports = { bookAppointment, cancelAppointment, myAppointments, getDoctorAppointments,getAllAppointments,rescheduleAppointment };