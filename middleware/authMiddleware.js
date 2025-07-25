const User = require('../models/userModel');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
dotenv.config();

const authMiddleware = async (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            token = req.headers.authorization.split(' ')[1];
            if (!token) {
                return res
                    .status(401)
                    .json({ message: 'Not authorized, Please log in' });
            }

            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            req.user = await User.findById(decoded.id).select('-password');
            next();
        }
        catch (err) {
            console.error('Auth middleware error:', err);
            res.status(401).json({ message: 'Not authorized, token failed' });
        }
    }
    else {
        
        res.status(401).json({ message: 'Please login to continue' });
       
    }
}

module.exports = authMiddleware;