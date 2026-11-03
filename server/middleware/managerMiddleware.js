
const managerMiddleware = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Please login first."
    });
  }

  if (req.user.role !== "manager") {
    return res.status(403).json({
      success: false,
      message: "Access denied. Manager only."
    });
  }

  next();
};

module.exports = managerMiddleware;
