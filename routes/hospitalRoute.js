const express=require('express');
const { allHospitalSpecializations, getHospitalById, getDoctorsByHospitalId }=require('../controllers/hospitalController')

const router=express.Router();

router.get('/:hospitalId/specialization',allHospitalSpecializations);
router.get('/:hospitalId',getHospitalById);
router.get('/:hospitalId/doctors',getDoctorsByHospitalId)

module.exports=router;