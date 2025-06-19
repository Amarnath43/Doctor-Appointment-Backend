const User=require('../models/userModel')
const Doctor = require('../models/doctorModel');
const Appointment=require('../models/appointmentModel')

const getPendingDoctors=async(req,res)=>{
    try
    {
        const pendingDoctors=await Doctor.find({status:'pending'}).populate('userId','-password');
        res.json(pendingDoctors)
    }
    catch (err) {
    console.error('server error:', err);
    res.status(500).json({ message: 'error from admin panel-server issue' });
  }
}


const updateDoctorStatus=async(req,res)=>{
    try
    {
    const doctorId=req.params.id;
    const {status}=req.body;
    const doctor=await Doctor.findById(doctorId);
    if(!doctor)
    {
        return res.status(404).json({message:"Doctor not found"})
    }

    doctor.status=status;
    await doctor.save();
    await User.findByIdAndUpdate(doctor.userId, {status:status})
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


const getAllPatients=async (req, res) => {
    try
    {
        const users=await User.find({role:'user',status:'active'}).select('-password');
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

const updatePatientStatus=async(req,res)=>{
   try
    {
    const userId=req.params.id;
    const {status}=req.body;
    const patient=await User.findById(userId);
    if(!patient)
    {
        return res.status(404).json({message:"Patient not found"})
    }

    patient.status=status;
    await patient.save();
    return res.status(200).json({ message: "Patient status updated successfully" });
    }
    catch (err) {
    console.error('server error:', err);
    res.status(500).json({ message: 'error from admin panel-server issue(upds)' });
  }
}


const adminDashboardStats=async(req,res)=>{
  try{
    
    const totalAppointments=await Appointment.countDocuments();
    const cancelledAppointments=await Appointment.countDocuments({status: 'cancelled'});
    const completedAppointments=await Appointment.countDocuments({status: 'completed'});


   
    const totalUsers=await User.countDocuments({role: 'user'});
    const activeUsers=await User.countDocuments({role: 'user', status:'active'})
    const blockedUsers=await User.countDocuments({role:'user', status:'blocked'});

     const totalDoctors=await Doctor.countDocuments();
     const activeDoctors=await Doctor.countDocuments({status: 'active'});
    const blockedDoctors=await Doctor.countDocuments({status: 'blocked'});


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

module.exports={getBlockedDoctors, getPendingDoctors, getAllActiveDoctors, getAllPatients, updateDoctorStatus, getBlockedPatients, updatePatientStatus, adminDashboardStats}


