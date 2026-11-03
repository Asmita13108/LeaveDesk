const User = require("../models/User");

const PROFILE_FIELDS = ["name", "phone", "department", "employeeId", "joiningDate", "address"];
const MAX_PHOTO_BYTES = 1024 * 1024;
const PHOTO_DATA_URL_PATTERN = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

const isValidImage = (dataUrl, bytes) => {
  if (dataUrl.startsWith("data:image/png;")) {
    return bytes.length >= 8 &&
      bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }

  if (dataUrl.startsWith("data:image/jpeg;")) {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }

  return dataUrl.startsWith("data:image/webp;") &&
    bytes.length >= 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP";
};

const serializeProfile = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  phone: user.phone || "",
  department: user.department || "",
  employeeId: user.employeeId || "",
  joiningDate: user.joiningDate || "",
  address: user.address || "",
  profilePhoto: user.profilePhoto || ""
});

const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.status(200).json({ success: true, profile: serializeProfile(user) });
  } catch (error) {
    console.error("Get profile error:", error.message);
    return res.status(500).json({ success: false, message: "Server error while fetching profile" });
  }
};

const getTeamDirectory = async (req, res) => {
  try {
    const [assignedEmployees, otherEmployees, managers] = await Promise.all([
      User.find({ role: "employee", manager: req.user.id })
        .select("name email role phone department employeeId joiningDate manager")
        .populate("manager", "name email")
        .sort({ role: 1, name: 1 }),
      User.find({ role: "employee", manager: { $ne: req.user.id } })
        .select("name email role manager")
        .populate("manager", "name email")
        .sort({ name: 1 }),
      User.find({ role: "manager" })
        .select("name email role")
        .sort({ name: 1 })
    ]);
    const members = [...assignedEmployees, ...otherEmployees, ...managers]
      .sort((left, right) =>
        String(left.role || "").localeCompare(String(right.role || "")) ||
        String(left.name || "").localeCompare(String(right.name || ""))
      );

    return res.status(200).json({
      success: true,
      count: members.length,
      members,
      managers
    });
  } catch (error) {
    console.error("Get team directory error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching team directory"
    });
  }
};

const assignEmployeeManager = async (req, res) => {
  try {
    const { managerId } = req.body || {};
    if (managerId !== null && managerId !== "" && typeof managerId !== "string") {
      return res.status(400).json({ success: false, message: "Manager ID must be a string or empty" });
    }

    const employee = await User.findById(req.params.employeeId);
    if (!employee) {
      return res.status(404).json({ success: false, message: "Employee not found" });
    }
    if (employee.role !== "employee") {
      return res.status(400).json({ success: false, message: "Only employees can be assigned to a manager" });
    }

    if (managerId === null || managerId === "") {
      employee.manager = null;
    } else {
      if (!/^[a-f\d]{24}$/i.test(managerId)) {
        return res.status(400).json({ success: false, message: "Invalid manager ID" });
      }

      const manager = await User.findOne({ _id: managerId, role: "manager" }).select("_id");
      if (!manager) {
        return res.status(404).json({ success: false, message: "Manager not found" });
      }
      employee.manager = manager._id;
    }

    await employee.save();
    const assignedManager = employee.manager
      ? await User.findById(employee.manager).select("name email")
      : null;

    return res.status(200).json({
      success: true,
      message: assignedManager
        ? `Employee assigned to ${assignedManager.name}`
        : "Employee is now unassigned",
      manager: assignedManager
    });
  } catch (error) {
    console.error("Assign employee manager error:", error.message);
    if (error.name === "CastError") {
      return res.status(400).json({ success: false, message: "Invalid employee ID" });
    }
    return res.status(500).json({ success: false, message: "Server error while assigning manager" });
  }
};

const updateProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const profile = req.body || {};
    for (const field of PROFILE_FIELDS) {
      if (profile[field] !== undefined && typeof profile[field] !== "string") {
        return res.status(400).json({ success: false, message: `${field} must be a string` });
      }
    }

    if (profile.name !== undefined && !profile.name.trim()) {
      return res.status(400).json({ success: false, message: "Name is required" });
    }

    const limits = { name: 100, phone: 30, department: 100, employeeId: 50, address: 500 };
    for (const [field, maxLength] of Object.entries(limits)) {
      if (profile[field] !== undefined && profile[field].trim().length > maxLength) {
        return res.status(400).json({
          success: false,
          message: `${field} must be ${maxLength} characters or fewer`
        });
      }
    }

    if (profile.joiningDate !== undefined && profile.joiningDate !== "") {
      const date = new Date(`${profile.joiningDate}T00:00:00.000Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(profile.joiningDate) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== profile.joiningDate) {
        return res.status(400).json({ success: false, message: "Joining date must be a valid date" });
      }
    }

    for (const field of PROFILE_FIELDS) {
      if (profile[field] !== undefined) {
        user[field] = field === "joiningDate" ? profile[field] : profile[field].trim();
      }
    }

    if (profile.profilePhoto !== undefined) {
      if (typeof profile.profilePhoto !== "string") {
        return res.status(400).json({ success: false, message: "Profile photo must be an image" });
      }

      if (profile.profilePhoto === "") {
        user.profilePhoto = "";
      } else {
        if (!PHOTO_DATA_URL_PATTERN.test(profile.profilePhoto)) {
          return res.status(400).json({
            success: false,
            message: "Photo must be a PNG, JPEG, or WebP image"
          });
        }

        const base64 = profile.profilePhoto.slice(profile.profilePhoto.indexOf(",") + 1);
        const photoBytes = Buffer.from(base64, "base64");
        if (photoBytes.length > MAX_PHOTO_BYTES) {
          return res.status(400).json({ success: false, message: "Photo must be 1 MB or smaller" });
        }
        if (!isValidImage(profile.profilePhoto, photoBytes)) {
          return res.status(400).json({ success: false, message: "The uploaded file is not a valid image" });
        }

        user.profilePhoto = profile.profilePhoto;
      }
    }

    await user.save();
    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      profile: serializeProfile(user)
    });
  } catch (error) {
    console.error("Update profile error:", error.message);
    return res.status(500).json({ success: false, message: "Server error while updating profile" });
  }
};

module.exports = { getProfile, getTeamDirectory, assignEmployeeManager, updateProfile };
