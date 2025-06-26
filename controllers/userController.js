const User = require('../models/userModel')
const Doctor = require('../models/doctorModel');
const Hospital=require('../models/hospitalModel')
const generateToken = require('../utils/generateToken')

const registerUser = async (req, res) => {
  try {
    const { name, email, phone, password} = req.body;


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
    if (!email || !password) {
      return res.status(400).json({ mesage: "Required login fields are missing" })
    }
    const existing = await User.findOne({ email })
    if (!existing) {
      return res.status(404).json({ mesage: "user not found" })
    }
    const match = await existing.matchPassword(password);

    if (!match) {
      return res.status(400).json({ mesage: "Password incorrect" })
    }

    const token = generateToken(existing);

    res.status(200).json({
      message: "Login successful",
      token,
      user: {
        id: existing._id,
        name: existing.name,
        email: existing.email,
        role: existing.role
      },

    })

  }
  catch (err) {
    console.error('Signin error:', err);
    res.status(500).json({ message: 'Signin error from server' });
  }
};


const searchDoctors = async (req, res) => {
  try {
    const { keyword = '', specialization = '', sortBy = 'user.name', sortOrder = 'asc', page=1, limit=10} = req.query;

    const regex=new RegExp(keyword, 'i');

    const matchConditions=[];

     // Always include only active doctors
    matchConditions.push({
      status: 'active'
    });


    if(keyword)
    {
      matchConditions.push({
        $or: [{specialization: regex},
          {hospitalName: regex},
          {'user.name': regex}]
          
        
      })
    }

    if(specialization)
    {
      matchConditions.push({
        specialization: specialization
      })
    }

   const skip=(page-1)*limit;

    const pipeline=[
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
      ...(matchConditions.length>0 ? [{
        $match: {$and: matchConditions}
      }] : [] ),
      {
        $project: {
          specialization: 1,
          hospitalName: 1,
          fee: 1,
          bio: 1,
          'user.name': 1

        }
      },
      {
        $sort: {
          [sortBy]: sortOrder=='desc'?-1: 1
        }
      },
      { $skip: skip },
      {$limit: limit}
    ];

      const countPipeline=[
        {
          $lookup: {
            from: 'users',
            localField: 'userId',
            foreignField: '_id',
            as: 'user'
          }
        },

        {$unwind: '$user'},
       ...(matchConditions.length>0 ?[{
        $match: {
          $and: matchConditions
        }
       }] :[]),
       
       {$count: 'total'}
      ];
    const [doctors,countResult] = await Promise.all([Doctor.aggregate(pipeline), Doctor.aggregate(countPipeline)]);



    const totalDoctors= countResult.length>0 ? countResult[0].total : 0;
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


const editProfile=async(req,res)=>{
  try{
    const role=req.user.role;
    const userId=req.user._id;
    const updateData=req.body;

    const userFields={
      name: updateData.name,
      email: updateData.email,
      phone: updateData.phone
    };

    if (req.file) {
      userFields.profilePicture = `/uploads/profile/${req.file.filename}`;
    }
    let profileResponse={};

    if(role==='user')
    {
      userFields.dob=updateData.dob;
      userFields.bloodGroup=updateData.bloodGroup;
      userFields.gender=updateData.gender;
      userFields.address=updateData.address;

      await User.findByIdAndUpdate(userId, userFields, { new: true });
      const profile=await User.findById(userId);
      profileResponse=profile;
    }
    

    if (role === 'doctor') {
       await User.findByIdAndUpdate(userId, userFields, { new: true });
      const doctorFields = {
        specialization: updateData.specialization,
        experience: updateData.experience,
        hospitalName: updateData.hospitalName,
        fee: updateData.fee,
        bio: updateData.bio
      }
      await Doctor.findOneAndUpdate({userId}, doctorFields, { new: true });
      const profile=await Doctor.findOne({userId}).populate('userId', '-password');
      profileResponse=profile;
  }
  
  
  return res.status(200).json({ message: "Profile updated successfully" ,profileResponse});
}
  catch (err) {
    console.error('Error updating profile data:', err);
    res.status(500).json({ message: 'Error updating profile data' });
  }

}


const allHospitals=async(req,res)=>{
  try
  {
    const hospitals=await Hospital.find();
    if(!hospitals || hospitals.length==0)
    {
       return res.status(404).json({ mesage: "Hospitals not found" })
    }
    res.status(200).json({message: "hospitals found", hospitals})

  }
  catch (err) {
    console.error('Error fetching hospitals', err);
    res.status(500).json({ message: 'Error fetching hospitals ' });
  }
}



module.exports = { registerUser, signin, searchDoctors,editProfile, allHospitals}