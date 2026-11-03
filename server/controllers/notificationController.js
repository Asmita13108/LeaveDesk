const Notification = require("../models/Notification");

const getNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({
      recipient: req.user.id
    }).sort({ createdAt: -1 }).limit(50);

    return res.status(200).json({
      success: true,
      notifications,
      unreadCount: notifications.filter((notification) => !notification.readAt).length
    });
  } catch (error) {
    console.error("Get notifications error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching notifications"
    });
  }
};

const markNotificationsRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { recipient: req.user.id, readAt: null },
      { $set: { readAt: new Date() } }
    );

    return res.status(200).json({
      success: true,
      message: "Notifications marked as read"
    });
  } catch (error) {
    console.error("Mark notifications read error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Server error while updating notifications"
    });
  }
};

module.exports = { getNotifications, markNotificationsRead };
