const Doctor = require('../models/doctorModel');
const User=require('../models/userModel');
const Fuse = require('fuse.js');
const mongoose = require('mongoose');
const Hospital=require('../models/hospitalModel');


const registerDoctor=async(req,res)=>{
    let session;
    try{
         session=await mongoose.startSession();
        session.startTransaction();
        const { name, email, phone, password, specialization, experience, hospitalName, location,googleMapsLink, hospitalPhoneNumber, fee, bio } = req.body;
        const existingUser=await User.findOne({email}).session(session);
        if(existingUser)
        {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: 'Email already registered' });
        };

        let hospital=await Hospital.findOne({name: {$regex: `^${hospitalName}$`, $options: 'i'}}).session(session);

        if(!hospital)
        {
            const allHospitals=await Hospital.find();
            const fuse= new Fuse(allHospitals, {
                keys: ['name', 'location'],
                threshold:0.3
            })
            const result=fuse.search(hospitalName);
            if(result.length>0)
            {
                hospital=result[0].item;
            }
        }

        if(!hospital)
        {
            hospital=await Hospital.create([{
                name:hospitalName, 
                location,
                googleMapsLink, 
                phoneNumber: hospitalPhoneNumber,
                createdByDoctor: true 
            }], {session})

            hospital=hospital[0]
        }

        const newUser=new User({
            name,
            email,
            phone,
            password,
            role: 'doctor'
        });

        await newUser.save({session});

        await Doctor.create([{
            userId: newUser._id,
            specialization,
            experience,
            hospital: hospital._id,
            fee,
            bio
        }], {session});

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

