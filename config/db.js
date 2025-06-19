const mongoose=require('mongoose');
const dotenv=require('dotenv');
dotenv.config();
const connectDB=async()=>{
    try{
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("MongoDB connection established")
    }
    catch(e)
    {
        console.log("MongoDB connection failed");
        process.exit(1);
        

    }
}
module.exports=connectDB;

/*
If the connection fails:
- Logs the error (`e`)
- Calls `process.exit(1)` to **terminate the app** with a non-zero status (meaning error)

> 🔐 This is important in production — you don't want your app running without a working database.
*/