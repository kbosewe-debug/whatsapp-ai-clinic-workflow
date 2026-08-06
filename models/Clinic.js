const mongoose = require("mongoose");

const openingHoursSchema = new mongoose.Schema(
  {
    dayOfWeek: {
      type: Number,
      min: 1,
      max: 7,
      required: true,
    },
    open: {
      type: String,
      required: true,
    },
    close: {
      type: String,
      required: true,
    },
    closed: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false }
);

const clinicSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
    },
    address: {
      type: String,
      required: true,
    },
    website: String,
    timezone: {
      type: String,
      default: "Africa/Nairobi",
    },
    openingHours: {
      type: [openingHoursSchema],
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

module.exports = mongoose.model("Clinic", clinicSchema);
