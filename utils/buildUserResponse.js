const buildUserResponse = async (userDoc) => {
  // This function creates the JSON structure your frontend expects.
  const responseData = {
    id: userDoc._id,
    name: userDoc.name,
    email: userDoc.email,
    phone: userDoc.phone,
    role: userDoc.role,
    status: {
      user: userDoc.status || 'active',
    },
    profilePicture: userDoc.profilePicture || '',
    profile: {
      gender: userDoc.gender || null,
      dob: userDoc.dob || null,
      bloodGroup: userDoc.bloodGroup || null,
      address: userDoc.address || '',
    },
    updatedAt: userDoc.updatedAt
  };

  // If the user is a doctor, add doctor-specific fields
  if (userDoc.role === 'doctor') {
    const doctor = await Doctor.findOne({ userId: userDoc._id }).populate('hospital');
    if (doctor) {
      responseData.status.doctor = doctor.status;
      responseData.specialization = doctor.specialization;
      responseData.experience = doctor.experience;
      responseData.fee = doctor.fee;
      responseData.bio = doctor.bio;
      responseData.hospital = doctor.hospital ? {
        name: doctor.hospital.name,
        location: doctor.hospital.location,
        phoneNumber: doctor.hospital.phoneNumber,
        googleMapsLink: doctor.hospital.googleMapsLink,
      } : null;
    }
  }

  return responseData;
};

module.exports = buildUserResponse;