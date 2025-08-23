const Doctor = require('../models/doctorModel');
const Hospital = require('../models/hospitalModel');
const User=require('../models/userModel')

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

const { makePublicUrlFromKey } = require('../utils/s3PublicUrl');

const toPublicUrls = (arr) =>
    (Array.isArray(arr) ? arr : [])
        .map(makePublicUrlFromKey)
        .filter(Boolean);

const getHospitalById = async (req, res) => {
    try {

        const { hospitalId } = req.params;
        const hospital = await Hospital.findById(hospitalId);
        if (!hospital) {
            return res.status(404).json({ message: 'Hospital not found' });
        }
        hospital.images = toPublicUrls(hospital.images);
        return res.status(200).json(hospital);
    } catch (err) {
        console.error('Error fetching hospital Data', err);
        return res
            .status(500)
            .json({ message: 'Error fetching hospital Data' });
    }
};



const { escapeRegex } = require('../utils/escapeRegex');

const getDoctorsByHospitalId = async (req, res) => {
    try {
        const { hospitalId } = req.params;

        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const limit = Math.max(parseInt(req.query.limit, 10) || 6, 1);
        const skip = (page - 1) * limit;

        const { specialization, search = '' } = req.query;

        // base filter
        const filter = { hospital: hospitalId };
        if (specialization) filter.specialization = specialization;

        // server-side search
        if (search.trim()) {
            const rx = new RegExp(escapeRegex(search.trim()), 'i');

            // Find users (doctors) whose *name* matches
            const users = await User.find({ name: rx }).select('_id').lean();
            const userIds = users.map(u => u._id);

            // Match either specialization text OR doctor name
            filter.$or = [
                { specialization: rx },
                ...(userIds.length ? [{ userId: { $in: userIds } }] : [])
            ];
        }

        const [doctors, totalCount] = await Promise.all([
            Doctor.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate({ path: 'hospital', select: 'name location' })
                .populate({ path: 'userId', select: 'name profilePicture' })
                .lean(),
            Doctor.countDocuments(filter),
        ]);

        const hasMore = skip + doctors.length < totalCount;

        return res.status(200).json({ data: doctors, hasMore });
    } catch (err) {
        console.error('Error fetching Doctors Data', err);
        return res.status(500).json({ message: 'Error fetching Doctors Data' });
    }
}



    module.exports = { allHospitalSpecializations, getHospitalById, getDoctorsByHospitalId };
