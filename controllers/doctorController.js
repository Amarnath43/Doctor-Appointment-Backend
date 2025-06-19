const Doctor = require('../models/doctorModel');
const User=require('../models/userModel')


const registerDoctor=async(req,res)=>{
    try{
        const { name, email, phone, password, specialization, experience, hospitalName, fee, bio } = req.body;
        const existingUser=await User.findOne({email});
        if(existingUser)
        {
            return res.status(400).json({ message: 'Email already registered' });
        }

        const newUser=new User({
            name,
            email,
            phone,
            password,
            role: 'doctor'
        });

        await newUser.save();

        await Doctor.create({
            userId: newUser._id,
            specialization,
            experience,
            hospitalName,
            fee,
            bio
        });

        res.status(201).json({
      message: 'Doctor registration successful. Waiting for admin approval.',
      role: newUser.role,
      status: newUser.status
    });
    }
    catch (err) {
    console.error("Error registering doctor:", err);
    res.status(500).json({ message: 'Server error' });
  }
}

const doctorAvailabilty = async (req, res) => {
    try{
    const doctorId = req.params.doctorId;
    const { availabilty } = req.body;

    const doctor = await Doctor.findById(doctorId);
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
        else
        {
            doctor.availability.push({date, slots})
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

module.exports={registerDoctor, doctorAvailabilty};

