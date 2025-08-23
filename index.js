const express = require('express');
const mongoose=require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
require('./cron/cleanExpiredSlots');
const path = require('path');
const userRoutes=require('./routes/userRoute')
const doctorRoutes=require('./routes/doctorRoute');
const adminRoutes=require('./routes/adminRoute');
const appointmentRoute=require('./routes/appointmentRoute');
const hospitalRoute=require('./routes/hospitalRoute');
const uploadRoutes=require('./routes/uploadRoutes');
const reviewRoute=require('./routes/reviewRoute');
const adminReviewsRouter = require('./routes/admin.review.routes');
const connectDB =require('./config/db')
dotenv.config();


//connect server to mongodb
connectDB();



const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
    origin:'*',
    methods:['GET','POST', 'PATCH', 'DELETE','PUT']
}))


app.use(express.json());
app.use('/api/user',userRoutes);
app.use('/api/doctor',doctorRoutes);
app.use('/api/admin',adminRoutes);
app.use('/api/appointments', appointmentRoute);
app.use('/api/hospitals', hospitalRoute);
app.use('/api',reviewRoute);
app.use('/api/admin/reviews', adminReviewsRouter);
app.use('/', (req,res,next)=>{
    console.log("user opened website");
    next();
})
app.use('/api/uploads',uploadRoutes)


// serve everything in ./uploads under the /uploads URL path
app.use(
  '/api/uploads',
  express.static(path.join(__dirname, 'uploads'))
);

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});


/*
Whenever you send a custom header like Authorization: Bearer <token>, the browser will treat your request as non-simple and automatically fire a preflight OPTIONS request to check CORS permissions first. That OPTIONS call must tell the browser it’s OK to send your custom header—otherwise your real request (and its response) will be blocked.


Why your Authorization header triggers preflight
Simple requests (e.g. GET with no special headers, or POST with Content-Type: text/plain) skip the preflight.

Non-simple requests include those with:

Content-Type: application/json

Any header not in the “simple header” list (Accept, Accept-Language, Content-Language, Content-Type limited to application/x-www-form-urlencoded, multipart/form-data, text/plain)

Custom headers like Authorization, X-My-App-Header, etc.

Because you’re adding Authorization, the browser does:

http
Copy
Edit
OPTIONS /api/user/register HTTP/1.1
Origin: http://localhost:5173
Access-Control-Request-Method: POST
Access-Control-Request-Headers: Authorization, Content-Type
2. What your server must respond to the OPTIONS
Your Express/CORS setup needs to reply with:

pgsql
Copy
Edit
Access-Control-Allow-Origin: <your frontend origin>
Access-Control-Allow-Methods: GET,POST,PUT,PATCH,DELETE,OPTIONS
Access-Control-Allow-Headers: Authorization,Content-Type
Access-Control-Allow-Credentials: true   ← only if you need cookies/auth


*/