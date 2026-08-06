const mongoose = require("mongoose");

const appointmentSchema = new mongoose.Schema(
  {
    clinicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Clinic",
      required: true,
      index: true,
    },
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Doctor",
      required: true,
      index: true,
    },
    bookingCode: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      index: true,
    },
    patientPhone: {
      type: String,
      required: true,
      index: true,
    },
    patientName: {
      type: String,
      required: true,
    },
    patientEmail: String,
    reason: String,
    startTime: {
      type: Date,
      required: true,
      index: true,
    },
    endTime: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: [
        "booked",
        "rescheduled",
        "cancelled",
        "completed",
        "no_show",
      ],
      default: "booked",
      index: true,
    },
    googleEventId: {
      type: String,
      default: null,
    },
    reminder24Sent: {
      type: Boolean,
      default: false,
    },
    reminder2Sent: {
      type: Boolean,
      default: false,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

appointmentSchema.index({
  doctorId: 1,
  startTime: 1,
  status: 1,
});

module.exports = mongoose.model("Appointment", appointmentSchema);
