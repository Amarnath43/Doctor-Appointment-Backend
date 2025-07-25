module.exports = function (req, res, next) {
  const secret = req.headers['x-admin-secret'];
  if (secret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ message: 'Forbidden: Invalid secret' });
  }
  next();
};
