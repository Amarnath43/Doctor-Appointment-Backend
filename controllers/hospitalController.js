const Doctor = require('../models/doctorModel');
const Hospital = require('../models/hospitalModel')

const allHospitalSpecializations = async (req, res) => {
    try {

        const { hospitalId } = req.params;
        const specializations = await Doctor.distinct(
            'specialization',
            { hospital: hospitalId }
        );

        return res.status(200).json({ specializations });
    } catch (err) {
        console.error('Error fetching specializations', err);
        return res
            .status(500)
            .json({ message: 'Error fetching specializations' });
    }
}


const getHospitalById = async (req, res) => {
    try {

        const { hospitalId } = req.params;
        const hospital = await Hospital.findById(hospitalId);
        if (!hospital) {
            return res.status(404).json({ message: 'Hospital not found' });
        }
        return res.status(200).json(hospital);
    } catch (err) {
        console.error('Error fetching hospital Data', err);
        return res
            .status(500)
            .json({ message: 'Error fetching hospital Data' });
    }
};


const getDoctorsByHospitalId = async (req, res) => {
    try {
        const { hospitalId } = req.params;
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const limit = Math.max(parseInt(req.query.limit, 10) || 6, 1);
        const skip = (page - 1) * limit;
        const filter = { hospital: hospitalId };
        if (req.query.specialization) {
            filter.specialization = req.query.specialization;
        }

        const [doctors, totalCount] = await Promise.all([
            Doctor.find(filter)
                .skip(skip)
                .limit(limit)
                .populate({ path: 'hospital', select: 'name location' })
                .populate({ path: 'userId', select: 'name profilePicture' }),
        Doctor.countDocuments(filter)
    ]);
const hasMore = skip + doctors.length < totalCount;
return res.status(200).json({ data: doctors, hasMore });
  } catch (err) {
    console.error('Error fetching Doctors Data', err);
    return res
        .status(500)
        .json({ message: 'Error fetching Doctors Data' });
}
};



module.exports = { allHospitalSpecializations, getHospitalById, getDoctorsByHospitalId };
