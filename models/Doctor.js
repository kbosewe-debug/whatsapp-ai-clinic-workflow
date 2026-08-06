const mongoose = require("mongoose");

const breakSchema = new mongoose.Schema(
  {
    start: {
      type: String,
      required: true,
    },
    end: {
      type: String,
      required: true,
    },
  },
  { _id: false }
);

const workingHourSchema = new mongoose.Schema(
  {
    // 1 = Monday, 7 = Sunday
    dayOfWeek: {
      type: Number,
      min: 1,
      max: 7,
      required: true,
    },
    start: {
      type: String,
      required: true,
    },
    end: {
      type: String,
      required: true,
    },
    breaks: {
      type: [breakSchema],
      default: [],
    },
  },
  { _id: false }
);

const doctorSchema = new mongoose.Schema(
  {
    clinicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Clinic",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    specialty: {
      type: String,
      required: true,
      trim: true,
    },
    calendarId: {
      type: String,
      default: "",
    },
    durationMinutes: {
      type: Number,
      default: 30,
      min: 5,
      max: 240,
    },
    slotIntervalMinutes: {
      type: Number,
      default: 30,
      min: 5,
      max: 240,
    },
    workingHours: {
      type: [workingHourSchema],
      default: [],
    },
    active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Doctor", doctorSchema);
