const mongoose = require('mongoose');
const bcrypt = require('bcryptjs')
const userSchema = new mongoose.Schema({
  name: {
    type: String,
    trim: true,
    required: [true, "Please provide your name"],
    minlength: [3, "Name must be at least 3 characters long"],
    maxlength: [20, "Name cannot exceed 20 characters"]
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    required: [true, "Please provide your email"],
    unique: true,
    match: [
      /^[0-9a-zA-Z._%+-]+@[0-9a-zA-Z.-]+\.[a-zA-Z]{2,}$/,
      "Please enter a valid email address"
    ]
  },
  phone: {
    type: String,
    required: [true, "Please provide your phone number"],
    unique: true,
    match: [
      /^[6-9]{1}[0-9]{9}$/,
      "Please provide a valid 10-digit Indian phone number starting with 6-9"
    ]
  },
  password: {
    type: String,
    required: [true, "Please provide a password"],
    minlength: [6, "Password must be at least 6 characters long"]
  },
  role: {
    type: String,
    required: [true, "Role is required"],
    enum: ['user', 'admin', 'doctor'],
    default: 'user'
  },
  status: {
    type: String,
    enum: ['pending', 'active', 'blocked'],
    default: function () {
      return this.role === 'doctor' ? 'pending' : 'active'
    }

  },
  isVerified: { type: Boolean, default: false },
  otp: String,
  otpExpiry: Date,
  lastOtpSentAt: Date,
  profilePicture: {
    type: String,
    default: '' 
  },
  dob: {
    type: Date
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'other']
  },
  bloodGroup: {
    type: String,
    enum: ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-']
  },
  address: {
    type: String,
    maxlength: 100
  }
},
  {
    timestamps: true
  });

userSchema.pre('save', async function (next) {
  if (!this.isModified('password') || this._passwordIsHashed) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
})

userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password)
}

module.exports = mongoose.model('User', userSchema);

//ismodified is a inbuilt function, it checks whether data is changed or not

/*
this.isModified(path) is a Mongoose instance method that checks whether a given path (field) has been changed/modified since the document was loaded or created.

const user = await User.findById(id);
user.phone = "9876543210";
await user.save();
password is not modified, so isModified('password') === false → skip hashing ✅
*/