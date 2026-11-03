
const Leave = require("../models/Leave");
const Notification = require("../models/Notification");
const User = require("../models/User");
const sendEmail = require("../services/emailService");

const createNotifications = async (recipientIds, notification) => {
  const recipients = Array.isArray(recipientIds) ? recipientIds : [];

  if (recipients.length === 0) return;

  try {
    await Notification.insertMany(
      recipients.map((recipient) => ({ ...notification, recipient }))
    );
  } catch (error) {
    console.error("Create leave notifications error:", error.message);
  }
};

const normalizeLeaveType = (leaveType) => {
  const value = typeof leaveType === "string" ? leaveType.trim() : "";

  if (!value) return null;

  return ["Casual", "Sick", "Earned"].find(
    (type) => type.toLowerCase() === value.toLowerCase()
  ) || null;
};

const normalizeLeaveStatus = (status) => {
  const value = typeof status === "string" ? status.trim() : "";

  if (!value) return null;

  return ["Approved", "Rejected"].find(
    (type) => type.toLowerCase() === value.toLowerCase()
  ) || null;
};

const DEFAULT_LEAVE_BALANCE = {
  Casual: 12,
  Sick: 12,
  Earned: 12
};

const INDIA_NATIONAL_HOLIDAYS = [
  { month: 0, day: 26 },
  { month: 7, day: 15 },
  { month: 9, day: 2 }
];

const getLeaveDays = (startDate, endDate) => {
  const start = new Date(startDate);
  const end = new Date(endDate);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 0;
  }

  const startDay = Date.UTC(
    start.getUTCFullYear(),
    start.getUTCMonth(),
    start.getUTCDate()
  );

  const endDay = Date.UTC(
    end.getUTCFullYear(),
    end.getUTCMonth(),
    end.getUTCDate()
  );

  const totalCalendarDays = Math.floor((endDay - startDay) / 86400000) + 1;

  if (totalCalendarDays <= 0) {
    return 0;
  }

  const fullWeeks = Math.floor(totalCalendarDays / 7);
  const remainingDays = totalCalendarDays % 7;
  let weekdays = fullWeeks * 5;
  const startWeekday = new Date(startDay).getUTCDay();

  for (let offset = 0; offset < remainingDays; offset += 1) {
    const weekday = (startWeekday + offset) % 7;

    if (weekday !== 0 && weekday !== 6) {
      weekdays += 1;
    }
  }

  for (let year = start.getUTCFullYear(); year <= end.getUTCFullYear(); year += 1) {
    INDIA_NATIONAL_HOLIDAYS.forEach(({ month, day }) => {
      const holiday = Date.UTC(year, month, day);

      if (holiday < startDay || holiday > endDay) {
        return;
      }

      const weekday = new Date(holiday).getUTCDay();

      if (weekday !== 0 && weekday !== 6) {
        weekdays -= 1;
      }
    });
  }

  return weekdays;
};

const getLeaveDaysInYear = (startDate, endDate, year) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const yearStart = Date.UTC(year, 0, 1);
  const yearEnd = Date.UTC(year + 1, 0, 1) - 86400000;
  const startDay = Math.max(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()),
    yearStart
  );
  const endDay = Math.min(
    Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()),
    yearEnd
  );

  return startDay <= endDay
    ? getLeaveDays(new Date(startDay), new Date(endDay))
    : 0;
};

const buildLeaveBalanceSummary = (leaves = [], year = new Date().getFullYear()) => {
  const summary = Object.entries(DEFAULT_LEAVE_BALANCE).reduce((acc, [type, entitlement]) => {
    acc[type] = {
      entitlement,
      used: 0,
      pending: 0,
      remaining: entitlement
    };

    return acc;
  }, {});

  leaves.forEach((leave) => {
    if (!["Approved", "Pending"].includes(leave.status)) {
      return;
    }

    const leaveType = normalizeLeaveType(leave.leaveType);

    if (!leaveType || !summary[leaveType]) {
      return;
    }

    const days = getLeaveDaysInYear(leave.startDate, leave.endDate, year);

    if (leave.status === "Approved") {
      summary[leaveType].used += days;
    } else {
      summary[leaveType].pending += days;
    }
  });

  Object.keys(summary).forEach((type) => {
    summary[type].remaining = Math.max(
      summary[type].entitlement - summary[type].used - summary[type].pending,
      0
    );
  });

  return summary;
};

const applyLeave = async (req, res) => {
  try {
    const { leaveType, startDate, endDate, reason } = req.body;
    // Check required fields
    if (!leaveType || !startDate || !endDate || !reason) {
      return res.status(400).json({
        success: false,
        message: "All fields are required"
      });
    }

    const employee = await User.findById(req.user.id).select("name email manager");
    if (!employee?.manager) {
      return res.status(400).json({
        success: false,
        message: "A manager must be assigned to your account before you can submit a leave request. Please contact your manager."
      });
    }
    const manager = await User.findOne({
      _id: employee.manager,
      role: "manager"
    }).select("_id email");
    if (!manager) {
      return res.status(400).json({
        success: false,
        message: "Your assigned manager account is unavailable. Please contact support."
      });
    }

    // Validate leave type
    const normalizedLeaveType = normalizeLeaveType(leaveType);

    if (!normalizedLeaveType) {
      return res.status(400).json({
        success: false,
        message: "Invalid leave type"
      });
    }

    // Validate dates
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime())
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid date format"
      });
    }

    // Compare calendar dates, ignoring time
    const startDay = Date.UTC(
      start.getUTCFullYear(),
      start.getUTCMonth(),
      start.getUTCDate()
    );

    const endDay = Date.UTC(
      end.getUTCFullYear(),
      end.getUTCMonth(),
      end.getUTCDate()
    );

    if (startDay < Date.UTC(
      new Date().getFullYear(),
      new Date().getMonth(),
      new Date().getDate()
    )) {
      return res.status(400).json({
        success: false,
        message: "Leave start date cannot be in the past"
      });
    }

    if (endDay < startDay) {
      return res.status(400).json({
        success: false,
        message: "End date cannot be before start date"
      });
    }

    if (getLeaveDays(startDate, endDate) === 0) {
      return res.status(400).json({
        success: false,
        message: "The selected dates contain no working days. Weekends and Indian national holidays are not counted."
      });
    }

    if (!reason.trim()) {
      return res.status(400).json({
        success: false,
        message: "Reason is required"
      });
    }

    const overlappingLeave = await Leave.findOne({
      employee: req.user.id,
      status: { $in: ["Approved", "Pending"] },
      startDate: { $lte: new Date(endDay + 86400000 - 1) },
      endDate: { $gte: new Date(startDay) }
    }).select("startDate endDate leaveType");

    if (overlappingLeave) {
      return res.status(409).json({
        success: false,
        message: `These dates overlap with an existing ${overlappingLeave.leaveType.toLowerCase()} leave request (${overlappingLeave.startDate.toISOString().slice(0, 10)} to ${overlappingLeave.endDate.toISOString().slice(0, 10)}).`
      });
    }

    for (let year = start.getUTCFullYear(); year <= end.getUTCFullYear(); year += 1) {
      const requestedDays = getLeaveDaysInYear(startDate, endDate, year);

      if (requestedDays === 0) continue;

      const yearStart = new Date(Date.UTC(year, 0, 1));
      const nextYearStart = new Date(Date.UTC(year + 1, 0, 1));
      const existingLeaves = await Leave.find({
        employee: req.user.id,
        leaveType: normalizedLeaveType,
        status: { $in: ["Approved", "Pending"] },
        startDate: { $lt: nextYearStart },
        endDate: { $gte: yearStart }
      }).select("startDate endDate");
      const reservedDays = existingLeaves.reduce(
        (total, leave) => total + getLeaveDaysInYear(leave.startDate, leave.endDate, year),
        0
      );
      const availableDays = Math.max(DEFAULT_LEAVE_BALANCE[normalizedLeaveType] - reservedDays, 0);

      if (requestedDays > availableDays) {
        return res.status(400).json({
          success: false,
          message: `Not enough ${normalizedLeaveType} leave balance for ${year}. ${availableDays} day(s) available; this request needs ${requestedDays}.`
        });
      }
    }

    // Create leave for the authenticated employee
    const leave = await Leave.create({
      employee: req.user.id,
      leaveType: normalizedLeaveType,
      startDate,
      endDate,
      reason: reason.trim()
    });

    await createNotifications(
      [manager._id],
      {
        title: "New leave request",
        message: `${employee.name || "An employee"} submitted a ${normalizedLeaveType.toLowerCase()} leave request.`,
        leave: leave._id
      }
    );
    await sendEmail({
      to: manager.email,
      subject: "New leave request",
      text: `${employee.name || "An employee"} submitted a ${normalizedLeaveType.toLowerCase()} leave request.\nDates: ${startDate} to ${endDate}\nReason: ${reason.trim()}`
    });

    return res.status(201).json({
      success: true,
      message: "Leave applied successfully",
      leave
    });
  } catch (error) {
    console.error("Apply leave error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Server error while applying for leave"
    });
  }
};

const getMyLeaves = async (req, res) => {
  try {
    const leaves = await Leave.find({
      employee: req.user.id
    }).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: leaves.length,
      leaves
    });
  } catch (error) {
    console.error("Get my leaves error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Server error while fetching leaves"
    });
  }
};

const cancelLeave = async (req, res) => {
  try {
    const { id } = req.params;

    let leave;

    try {
      leave = await Leave.findOne({
        _id: id,
        employee: req.user.id
      });
    } catch (error) {
      if (error.name === "CastError") {
        return res.status(400).json({
          success: false,
          message: "Invalid leave ID"
        });
      }

      throw error;
    }

    if (!leave) {
      return res.status(404).json({
        success: false,
        message: "Leave not found"
      });
    }

    if (leave.status !== "Pending") {
      return res.status(400).json({
        success: false,
        message: "Only pending leaves can be cancelled"
      });
    }

    const employee = await User.findById(leave.employee).select("name manager");
    const manager = employee?.manager
      ? await User.findById(employee.manager).select("_id email")
      : null;

    await Leave.findByIdAndDelete(id);

    await createNotifications(
      manager ? [manager._id] : [],
      {
        title: "Leave cancelled",
        message: `${employee?.name || "An employee"} cancelled a ${leave.leaveType.toLowerCase()} leave request.`,
        leave: leave._id
      }
    );

    if (manager) await sendEmail({
      to: manager.email,
      subject: "Leave request cancelled",
      text: `${employee?.name || "An employee"} cancelled a ${leave.leaveType.toLowerCase()} leave request.\nDates: ${leave.startDate.toISOString().slice(0, 10)} to ${leave.endDate.toISOString().slice(0, 10)}`
    });

    return res.status(200).json({
      success: true,
      message: "Leave cancelled successfully"
    });
  } catch (error) {
    console.error("Cancel leave error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Server error while cancelling leave"
    });
  }
};

const getAllLeaves = async (req, res) => {
  try {
    const employees = await User.find({
      role: "employee",
      manager: req.user.id
    }).select("_id");
    const leaves = await Leave.find({ employee: { $in: employees.map(({ _id }) => _id) } })
      .populate("employee", "name email")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: leaves.length,
      leaves
    });
  } catch (error) {
    console.error("Get all leaves error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Server error while fetching all leaves"
    });
  }
};

const getMyLeaveSummary = async (req, res) => {
  try {
    const year = Number(req.query.year) || new Date().getFullYear();
    const startOfYear = new Date(Date.UTC(year, 0, 1, 0, 0, 0));
    const startOfNextYear = new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0));

    const leaves = await Leave.find({
      employee: req.user.id,
      startDate: { $lt: startOfNextYear },
      endDate: { $gte: startOfYear }
    }).select("leaveType startDate endDate status");

    const summary = buildLeaveBalanceSummary(leaves, year);
    const totalApprovedDays = Object.values(summary).reduce(
      (total, item) => total + item.used,
      0
    );

    return res.status(200).json({
      success: true,
      year,
      summary,
      totalApprovedDays
    });
  } catch (error) {
    console.error("Get my leave summary error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Server error while fetching leave summary"
    });
  }
};

const getTeamLeaveSummary = async (req, res) => {
  try {
    const year = Number(req.query.year) || new Date().getFullYear();
    const startOfYear = new Date(Date.UTC(year, 0, 1, 0, 0, 0));
    const startOfNextYear = new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0));

    const employees = await User.find({
      role: "employee",
      manager: req.user.id
    }).select("_id name");

    const employeeSummaries = await Promise.all(
      employees.map(async (employee) => {
        const leaves = await Leave.find({
          employee: employee._id,
          startDate: { $lt: startOfNextYear },
          endDate: { $gte: startOfYear }
        }).select("leaveType startDate endDate status");

        return {
          employee: {
            _id: employee._id,
            name: employee.name
          },
          summary: buildLeaveBalanceSummary(leaves, year)
        };
      })
    );

    const teamSummary = Object.keys(DEFAULT_LEAVE_BALANCE).reduce((acc, type) => {
      acc[type] = {
        entitlement: DEFAULT_LEAVE_BALANCE[type],
        used: 0,
        pending: 0,
        remaining: DEFAULT_LEAVE_BALANCE[type]
      };
      return acc;
    }, {});

    employeeSummaries.forEach(({ summary }) => {
      Object.keys(teamSummary).forEach((type) => {
        teamSummary[type].used += summary[type].used;
        teamSummary[type].pending += summary[type].pending;
      });
    });

    Object.keys(teamSummary).forEach((type) => {
      teamSummary[type].entitlement *= employees.length;
      teamSummary[type].remaining = Math.max(
        teamSummary[type].entitlement -
          teamSummary[type].used -
          teamSummary[type].pending,
        0
      );
    });

    return res.status(200).json({
      success: true,
      year,
      totalEmployees: employees.length,
      summary: teamSummary,
      employees: employeeSummaries
    });
  } catch (error) {
    console.error("Get team leave summary error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Server error while fetching team leave summary"
    });
  }
};

const updateLeaveStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, managerComment = "" } = req.body;
    const normalizedStatus = normalizeLeaveStatus(status);

    if (!normalizedStatus) {
      return res.status(400).json({
        success: false,
        message: "Status must be Approved or Rejected"
      });
    }

    if (typeof managerComment !== "string") {
      return res.status(400).json({
        success: false,
        message: "Manager comment must be a string"
      });
    }

    if (managerComment.length > 500) {
      return res.status(400).json({
        success: false,
        message: "Manager comment must be 500 characters or fewer"
      });
    }

    const leave = await Leave.findById(id).populate("employee", "name email");

    if (!leave) {
      return res.status(404).json({
        success: false,
        message: "Leave not found"
      });
    }
    if (!leave.employee) {
      return res.status(404).json({
        success: false,
        message: "Employee for this leave request was not found"
      });
    }

    const assignedEmployee = await User.exists({
      _id: leave.employee._id,
      role: "employee",
      manager: req.user.id
    });
    if (!assignedEmployee) {
      return res.status(403).json({
        success: false,
        message: "You can only review leave requests from employees assigned to you"
      });
    }

    if (leave.status !== "Pending") {
      return res.status(400).json({
        success: false,
        message: "Only pending leaves can be updated"
      });
    }

    leave.status = normalizedStatus;
    leave.managerComment = managerComment.trim();

    await leave.save();

    await createNotifications([leave.employee._id], {
      title: `Leave request ${normalizedStatus.toLowerCase()}`,
      message: `Your ${leave.leaveType.toLowerCase()} leave request was ${normalizedStatus.toLowerCase()}.${
        leave.managerComment ? ` Manager comment: ${leave.managerComment}` : ""
      }`,
      leave: leave._id
    });
    await sendEmail({
      to: leave.employee.email,
      subject: `Leave request ${normalizedStatus.toLowerCase()}`,
      text: `Your ${leave.leaveType.toLowerCase()} leave request (${leave.startDate.toISOString().slice(0, 10)} to ${leave.endDate.toISOString().slice(0, 10)}) was ${normalizedStatus.toLowerCase()}.${leave.managerComment ? `\nManager comment: ${leave.managerComment}` : ""}`
    });

    return res.status(200).json({
      success: true,
      message: `Leave ${normalizedStatus.toLowerCase()} successfully`,
      leave
    });
  } catch (error) {
    console.error("Update leave status error:", error.message);

    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid leave ID"
      });
    }

    return res.status(500).json({
      success: false,
      message: "Server error while updating leave status"
    });
  }
};

module.exports = {
  applyLeave,
  getMyLeaves,
  cancelLeave,
  getAllLeaves,
  getMyLeaveSummary,
  getTeamLeaveSummary,
  updateLeaveStatus
};