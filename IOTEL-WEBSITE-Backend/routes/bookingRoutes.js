const express = require("express");
const controller = require("../controllers/bookingController");
const { authenticate } = require("../middleware/auth");
const { requireRoles } = require("../middleware/roles");
const router = express.Router();

router.get("/services", controller.getServices);
router.get("/services/schedules", controller.getSchedules);
router.post("/services", authenticate, requireRoles("admin"), controller.createService);
router.post("/services/:serviceId/schedules", authenticate, requireRoles("admin", "staff"), controller.createSchedule);
router.post("/bookings", authenticate, controller.createBooking);
router.get("/bookings", authenticate, controller.getBookings);
router.put("/bookings/:id/cancel", authenticate, controller.cancelOwnBooking);
router.put("/bookings/:id", authenticate, requireRoles("admin", "staff"), controller.updateBooking);

module.exports = router;
