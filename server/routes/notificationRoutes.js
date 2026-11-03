const express = require("express");
const router = express.Router();

const {
  getNotifications,
  markNotificationsRead
} = require("../controllers/notificationController");
const authMiddleware = require("../middleware/authMiddleware");

router.get("/", authMiddleware, getNotifications);
router.patch("/read", authMiddleware, markNotificationsRead);

module.exports = router;
