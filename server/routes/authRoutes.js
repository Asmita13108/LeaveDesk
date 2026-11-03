
const express = require("express");
const router = express.Router();

const {
  registerUser,
  loginUser
} = require("../controllers/authController");
const {
  getProfile,
  getTeamDirectory,
  assignEmployeeManager,
  updateProfile
} = require("../controllers/profileController");
const authMiddleware = require("../middleware/authMiddleware");
const managerMiddleware = require("../middleware/managerMiddleware");

// Signup API
router.post("/register", registerUser);

// Login API
router.post("/login", loginUser);
router.get("/profile", authMiddleware, getProfile);
router.patch("/profile", authMiddleware, updateProfile);
router.get("/directory", authMiddleware, managerMiddleware, getTeamDirectory);
router.patch(
  "/directory/:employeeId/manager",
  authMiddleware,
  managerMiddleware,
  assignEmployeeManager
);

module.exports = router;
