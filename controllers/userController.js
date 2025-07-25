const User = require('../models/userModel')
const Doctor = require('../models/doctorModel');
const Hospital = require('../models/hospitalModel')
const generateToken = require('../utils/generateToken')
const Appointment=require('../models/appointmentModel')

const registerUser = async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;
    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    const newUser = new User({
      name,
      email,
      phone,
      password,
      role: 'user'
    });

    await newUser.save();


    res.status(201).json({
      message: 'Registration successful',
      role: newUser.role,
      status: newUser.status
    });
  }

  catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ message: 'Server error during registration' });
  }
};

const signin = async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. Check for required fields
    if (!email || !password) {
      return res.status(400).json({
        field: !email ? 'email' : 'password',
        message: `${!email ? 'Email' : 'Password'} is required`
      });
    }

    // 2. Check if user exists
    const existing = await User.findOne({ email });
    if (!existing) {
      return res.status(404).json({
        field: 'email',
        message: "Email doesn't exist! Please register."
      });
    }

    // 3. Validate password
    const match = await existing.matchPassword(password);
    if (!match) {
      return res.status(400).json({
        field: 'password',
        message: 'Wrong password.'
      });
    }

    // 4. Generate token
    const token = generateToken(existing);

    // 5. Base response for any user
    const responseData = {
      id: existing._id,
      name: existing.name,
      email: existing.email,
      phone: existing.phone,
      role: existing.role,
      status: {
        user: existing.status
      },
      profilePicture: existing.profilePicture || ''
    };

    // // 6. User-specific fields
    if (existing.role === 'user') {
      responseData.profile = {
        gender: existing.gender || null,
        dob: existing.dob || null,
        bloodGroup: existing.bloodGroup || null,
        address: existing.address || '',

      };
    }


    // 7. Doctor-specific fields
    if (existing.role === 'doctor') {
      const doctor = await Doctor.findOne({ userId: existing._id }).populate('hospital');

      if (!doctor) {
        return res.status(400).json({ message: 'Doctor profile not found.' });
      }

      responseData.status.doctor = doctor.status;
      responseData.specialization = doctor.specialization;
      responseData.experience = doctor.experience;
      responseData.fee = doctor.fee;
      responseData.bio = doctor.bio;
      responseData.availability = doctor.availability;

      if (doctor.hospital) {
        responseData.hospital = {
          name: doctor.hospital.name,
          location: doctor.hospital.location,
          phoneNumber: doctor.hospital.phoneNumber,
          googleMapsLink: doctor.hospital.googleMapsLink
        };
      }
    }
    console.log(responseData);

    // 7. Success response
    return res.status(200).json({
      message: 'Login successful',
      token,
      user: responseData
    });

  } catch (err) {
    console.error('Signin error:', err);
    return res.status(500).json({ message: 'Signin error from server' });
  }
};



const searchDoctors = async (req, res) => {
  try {
    const { keyword = '', specialization = '', sortBy = 'user.name', sortOrder = 'asc', page = 1, limit = 6 } = req.query;
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const regex = new RegExp(keyword, 'i');

    const matchConditions = [];

    // Always include only active doctors
    matchConditions.push({
      status: 'active'
    });


    if (keyword) {
      matchConditions.push({
        $or: [{ specialization: regex },
        { 'hospital.name': regex },
        { 'user.name': regex }]


      })
    }

    if (specialization) {
      matchConditions.push({
        specialization: specialization
      })
    }

    const skip = (pageNum - 1) * limitNum;

    const pipeline = [
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'user'
        }
      },
      {
        $unwind: '$user'
      },

      {
        $lookup: {
          from: 'hospitals',
          localField: 'hospital',
          foreignField: '_id',
          as: 'hospital'
        }
      },
      { $unwind: '$hospital' },
      ...(matchConditions.length > 0 ? [{
        $match: { $and: matchConditions }
      }] : []),
      {
        $project: {
          specialization: 1,
          experience: 1,
          fee: 1,
          bio: 1,
          fee: 1,
          'user.profilePicture': 1,
          'user.name': 1,
          'hospital.name': 1,
          'hospital.location': 1,
          'hospital.phoneNumber': 1,
          'hospital.googleMapsLink': 1

        }
      },
      {
        $sort: {
          [sortBy]: sortOrder == 'desc' ? -1 : 1
        }
      },
      { $skip: skip },
      { $limit: limitNum }
    ];

    const countPipeline = [
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'user'
        }
      },

      { $unwind: '$user' },
      ...(matchConditions.length > 0 ? [{
        $match: {
          $and: matchConditions
        }
      }] : []),

      { $count: 'total' }
    ];
    const [doctors, countResult] = await Promise.all([Doctor.aggregate(pipeline), Doctor.aggregate(countPipeline)]);



    const totalDoctors = countResult.length > 0 ? countResult[0].total : 0;
    res.status(200).json({
      data: doctors,
      count: totalDoctors,
      limit,
      page,
      totalPages: Math.ceil(totalDoctors / limit)
    });


  }
  catch (err) {
    console.error('Unable to fetch doctor data:', err);
    res.status(500).json({ message: 'Unable to fetch doctor data: from server' });
  }


}



const editProfile = async (req, res) => {
  try {
    const userId = req.user._id;
    const role = req.user.role;
    const data = req.body;

     
    // Step 1: Prepare user fields (shared)
    const userFields = {
      name: data.name,
    };

    if (req.file) {
      userFields.profilePicture = `/uploads/profile/${req.file.filename}`;
    }

    // Add user-only fields if role is user
    if (role === 'user') {
      userFields.gender = data.gender;
      userFields.dob = data.dob;
      userFields.bloodGroup = data.bloodGroup;
      userFields.address = data.address;
    }

    // Update User collection
    await User.findByIdAndUpdate(userId, userFields);

    // Step 2: If doctor, update Doctor model
    if (role === 'doctor') {
      const doctorFields = {
        specialization: data.specialization,
        experience: data.experience,
        fee: data.fee,
        bio: data.bio,
      };

      await Doctor.findOneAndUpdate({ userId }, doctorFields);
    }

    // Step 3: Refetch updated data
    const updatedUser = await User.findById(userId).lean();
    let updatedDoctor = null;

    if (role === 'doctor') {
      updatedDoctor = await Doctor.findOne({ userId })
        .populate('hospital')
        .lean();
    }

    // Step 4: Build consistent response object
    const responseData = {
      id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      phone: updatedUser.phone,
      role: updatedUser.role,
      profilePicture: updatedUser.profilePicture || '',
      status: {
        user: updatedUser.status,
        ...(role === 'doctor' && { doctor: updatedDoctor.status }),
      },
    };

    if (role === 'user') {
      responseData.profile = {
        gender: updatedUser.gender || null,
        dob: updatedUser.dob || null,
        bloodGroup: updatedUser.bloodGroup || null,
        address: updatedUser.address || '',
      };
    }

    if (role === 'doctor') {
      responseData.specialization = updatedDoctor.specialization;
      responseData.experience = updatedDoctor.experience;
      responseData.fee = updatedDoctor.fee;
      responseData.bio = updatedDoctor.bio;
      responseData.availability = updatedDoctor.availability;

      responseData.hospital = {
        name: updatedDoctor.hospital?.name || '',
        location: updatedDoctor.hospital?.location || '',
        phoneNumber: updatedDoctor.hospital?.phoneNumber || '',
        googleMapsLink: updatedDoctor.hospital?.googleMapsLink || '',
      };
    }
console.log(responseData)
    return res.status(200).json({
      message: 'Profile updated successfully',
      user: responseData,
    });
  } catch (err) {
    console.error('Error updating profile data:', err);
    return res.status(500).json({ message: 'Error updating profile data' });
  }
};




const allHospitals = async (req, res) => {
  try {
    const hospitals = await Hospital.find();
    if (!hospitals || hospitals.length == 0) {
      return res.status(404).json({ mesage: "Hospitals not found" })
    }
    res.status(200).json({ message: "hospitals found", hospitals })

  }
  catch (err) {
    console.error('Error fetching hospitals', err);
    res.status(500).json({ message: 'Error fetching hospitals ' });
  }
}

const allSpecializations = async (req, res) => {
  try {
    const specializations = await Doctor.distinct('specialization', { status: 'pending' });
    res.status(200).json({ specializations });
  }
  catch (err) {
    console.error('Error fetching specializations', err);
    res.status(500).json({ message: 'Error fetching specializations ' });
  }
}


const finddoctorsByHospital = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const hospitals = await Hospital.aggregate(
      [
        {
          $match: { status: 'active' }
        },
        {
          $lookup: {
            from: 'doctors',
            localField: '_id',
            foreignField: 'hospital',
            as: 'doctors'
          }
        }, {
          $addFields: {
            doctorCount: { $size: '$doctors' }
          }
        },
        {
          $project: {
            name: 1,
            imageUrl: 1,
            location: 1,
            doctorCount: 1
          }
        },
        { $skip: skip },
        { $limit: limit }
      ]
    )

    const totalHospitals = await Hospital.countDocuments({ status: 'pending' });

    res.status(200).json({
      total: totalHospitals,
      page,
      totalPages: Math.ceil(totalHospitals / limit),
      data: hospitals
    });
  }
  catch (err) {
    console.error('Error fetching doctors by hospital', err);
    res.status(500).json({ message: 'Error fetching doctors by hospital ' });
  }
}

const getDoctorData=async(req,res)=>{
  try
  {
    const {id}=req.params
    const doctor=await Doctor.findById(id).populate({
      path:'userId',
      select:'name email phone'
    }).populate({
      path:'hospital',
      select:'name location'
    }).lean();

     if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }
     res.status(200).json(doctor);
  }
   catch (err) {
    console.error('Error fetching doctor data', err);
    res.status(500).json({ message: 'Error fetching doctor data ' });
  }

}

const appointmentHistory=async(req,res)=>{
  
    const userId=req.user._id;
    const status=req.query.status;
    if (!['Confirmed', 'Completed', 'Cancelled'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status value' });
  }

  const appointments=await Appointment.find({userId:userId, status:status}).populate({
  path: 'doctorId',
  select: 'name specialization fee hospital userId',
  populate: [
    {
      path: 'hospital',
      select: 'name'
    },
    {
      path: 'userId',
      select: 'name email' // get the actual user's info behind the doctor
    }
  ]
}).populate('userId', 'name').sort({ createdAt: -1 });
console.log(appointments)
    res.json(appointments);

  try
  {
  }
  catch (err) {
    console.error('Error fetching Appointment History', err);
    res.status(500).json({ message: 'Error fetching Appointment History' });
  }
}


const createAdmin = async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    if (!name || !email || !phone || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const existingUser = await User.findOne({ $or: [{ email }, { phone }] });
    if (existingUser) {
      return res.status(409).json({ message: 'User already exists' });
    }

    const newAdmin = new User({
      name,
      email,
      phone,
      password,
      role: 'admin',
      status: 'active',
    });

    await newAdmin.save();
    res.status(201).json({ message: 'Admin created successfully' });
  } catch (error) {
    console.error('Admin creation failed:', error);
    res.status(500).json({ message: 'Server error' });
  }
};






module.exports = { registerUser, signin, searchDoctors, editProfile, allHospitals, allSpecializations, finddoctorsByHospital, getDoctorData, appointmentHistory, createAdmin}