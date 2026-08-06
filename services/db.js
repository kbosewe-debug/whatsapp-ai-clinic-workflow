const mongoose = require("mongoose");
const Clinic = require("../models/Clinic");

//async function connectDatabase() {
//const uri = process.env.MONGODB_URI;

//if (!uri) {
//throw new Error("MONGODB_URI is required.");
//}

//await mongoose.connect(uri);
//console.log("Connected to MongoDB.");
//}

async function connectDatabase() {
  const uri = process.env.MONGODB_URI;

  console.log("Connecting to:", uri);

  mongoose.set("debug", true);

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10000,
  });

  console.log("Connected to MongoDB.");
}

async function getDefaultClinic() {
  if (process.env.DEFAULT_CLINIC_ID) {
    return Clinic.findById(process.env.DEFAULT_CLINIC_ID);
  }

  return Clinic.findOne({ active: true }).sort({ createdAt: 1 });
}

module.exports = {
  connectDatabase,
  getDefaultClinic,
};
