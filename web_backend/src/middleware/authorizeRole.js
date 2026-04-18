function authorizeRole(...roles) {
  return (req, _res, next) => {
    if (!roles.includes(req.admin?.role)) {
      const error = new Error('Access denied');
      error.status = 403;
      return next(error);
    }
    return next();
  };
}

module.exports = authorizeRole;
