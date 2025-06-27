const express = require('express');
const mongoose=require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const userRoutes=require('./routes/userRoute')
const doctorRoutes=require('./routes/doctorRoute');
const adminRoutes=require('./routes/adminRoute');
const appointmentRoute=require('./routes/appointmentRoute')
const connectDB =require('./config/db')
dotenv.config();


//connect server to mongodb
connectDB();



const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
    origin:'*',
    methods:['GET','POST', 'PATCH', 'DELETE','PUT']
}))
app.use(express.json());
app.use('/api/user',userRoutes);
app.use('/api/doctor',doctorRoutes);
app.use('/api/admin',adminRoutes);
app.use('/api/appointments', appointmentRoute)
app.use('/', (req,res,next)=>{
    console.log("user opened website");
    next();
})

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
