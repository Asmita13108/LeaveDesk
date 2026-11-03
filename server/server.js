
const express = require("express");
const cors = require("cors");
require("dotenv").config();
const connectDB = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const leaveRoutes = require("./routes/leaveRoutes");
const notificationRoutes = require("./routes/notificationRoutes");

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use("/api/auth", authRoutes);
app.use("/api/leaves", leaveRoutes);
app.use("/api/notifications", notificationRoutes);
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "LeaveDesk Backend is running"
  });
});

const PORT = process.env.PORT || 4000;
const startServer = async () => {
  await connectDB();

  app.listen(PORT, () => {
    console.log(`LeaveDesk Backend running on http://localhost:${PORT}`);
  });
};

startServer();
