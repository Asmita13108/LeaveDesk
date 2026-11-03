
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const registerUser = async (req, res) => {
  try {
    const {
      name: submittedName,
      email: submittedEmail,
      password,
      role: submittedRole = "employee",
      managerInviteCode,
    } = req.body || {};
    const name =
      typeof submittedName === "string" ? submittedName.trim() : "";
    const email =
      typeof submittedEmail === "string" ? submittedEmail.trim() : "";
    const role =
      typeof submittedRole === "string" ? submittedRole.trim() : "";

    if (!["employee", "manager"].includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Role must be employee or manager"
      });
    }

    if (role === "manager") {
      const configuredInviteCode = process.env.MANAGER_INVITE_CODE;

      if (!configuredInviteCode) {
        console.error("MANAGER_INVITE_CODE is missing in the server environment");
        return res.status(503).json({
          success: false,
          message: "Manager signup is not configured. Contact your administrator."
        });
      }

      if (
        typeof managerInviteCode !== "string" ||
        managerInviteCode.trim() !== configuredInviteCode
      ) {
        return res.status(403).json({
          success: false,
          message: "Invalid manager invite code"
        });
      }
    }

    // Validate required fields
    const submittedFields = req.body || {};
    const requiredFields = ["name", "email", "password"];
    const receivedFields = requiredFields.filter((field) =>
      Object.prototype.hasOwnProperty.call(submittedFields, field)
    );
    const missingFields = requiredFields.filter((field) => {
      const value = submittedFields[field];
      return typeof value !== "string" || !value.trim();
    });

    if (missingFields.length > 0) {
      console.warn("Registration request missing required fields:", {
        missingFields,
        receivedFields
      });
      return res.status(400).json({
        success: false,
        message: `Missing: ${missingFields.join(", ")}. Received: ${
          receivedFields.join(", ") || "none"
        }.`
      });
    }

    // Validate password length
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters"
      });
    }

    // Check if user already exists
    const normalizedEmail = email.toLowerCase();

    const existingUser = await User.findOne({
      email: normalizedEmail
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "Email is already registered"
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Manager accounts require a valid server-side invite code.
    const user = await User.create({
      name,
      email: normalizedEmail,
      password: hashedPassword,
      role
    });

    return res.status(201).json({
      success: true,
      message: "User registered successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Email is already registered"
      });
    }

    console.error("Registration error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Server error during registration"
    });
  }
};

const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required"
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const user = await User.findOne({
      email: normalizedEmail
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password"
      });
    }

    const isPasswordValid = await bcrypt.compare(
      password,
      user.password
    );

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password"
      });
    }

    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET is missing in the server environment");

      return res.status(500).json({
        success: false,
        message: "Server configuration error"
      });
    }

    const token = jwt.sign(
      {
        id: user._id.toString(),
        role: user.role
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error("Login error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Server error during login"
    });
  }
};

module.exports = { registerUser, loginUser };
