
const express = require("express");
const router = express.Router();

const {
  applyLeave,
  getMyLeaves,
  cancelLeave,
  getAllLeaves,
  getMyLeaveSummary,
  getTeamLeaveSummary,
  updateLeaveStatus
} = require("../controllers/leaveController");

const authMiddleware = require("../middleware/authMiddleware");
const managerMiddleware = require("../middleware/managerMiddleware");

// Employee APIs
router.post("/", authMiddleware, applyLeave);
router.get("/my-leaves", authMiddleware, getMyLeaves);
router.get("/my-summary", authMiddleware, getMyLeaveSummary);
router.delete("/:id", authMiddleware, cancelLeave);

// Manager-only APIs
router.get(
  "/all",
  authMiddleware,
  managerMiddleware,
  getAllLeaves
);

router.get(
  "/summary",
  authMiddleware,
  managerMiddleware,
  getTeamLeaveSummary
);

router.patch(
  "/:id/status",
  authMiddleware,
  managerMiddleware,
  updateLeaveStatus
);

module.exports = router;
