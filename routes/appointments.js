const router = require("express").Router();

const { supabase } = require("../config/supabase");
const appointments = require("../services/appointments");

router.get("/", async (req, res) => {
  try {
    let query = supabase
      .from("appointments")
      .select(
        `
        *,
        patients(name, phone),
        doctors(name, specialty)
      `,
      )
      .order("starts_at", {
        ascending: true,
      });

    if (req.query.clinicId) {
      query = query.eq("clinic_id", req.query.clinicId);
    }

    const result = await query;

    if (result.error) {
      throw result.error;
    }

    res.json({
      appointments: result.data || [],
    });
  } catch (error) {
    console.error("Get appointments error:", error.message);

    res.status(500).json({
      error: error.message,
    });
  }
});

router.post("/", async (req, res) => {
  try {
    const appointment = await appointments.createAppointment(req.body);

    res.status(201).json({
      appointment,
    });
  } catch (error) {
    console.error("Create appointment error:", error.message);

    res.status(400).json({
      error: error.message,
    });
  }
});

router.patch("/:id/cancel", async (req, res) => {
  try {
    const appointment = await appointments.cancelAppointment(req.params.id);

    res.json({
      appointment,
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
});

router.patch("/:id/reschedule", async (req, res) => {
  try {
    const appointment = await appointments.rescheduleAppointment({
      appointmentId: req.params.id,
      startsAt: req.body.startsAt,
      endsAt: req.body.endsAt,
    });

    res.json({
      appointment,
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
});

module.exports = router;
