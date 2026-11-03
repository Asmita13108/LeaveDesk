
const mongoose = require("mongoose");
const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    password: {
      type: String,
      required: true,
      minlength: 8
    },
    role: {
      type: String,
      enum: ["employee", "manager"],
      default: "employee"
    },
    manager: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },
    phone: {
      type: String,
      trim: true,
      maxlength: 30,
      default: ""
    },
    department: {
      type: String,
      trim: true,
      maxlength: 100,
      default: ""
    },
    employeeId: {
      type: String,
      trim: true,
      maxlength: 50,
      default: ""
    },
    joiningDate: {
      type: String,
      default: ""
    },
    address: {
      type: String,
      trim: true,
      maxlength: 500,
      default: ""
    },
    profilePhoto: {
      type: String,
      default: ""
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("User", userSchema);
