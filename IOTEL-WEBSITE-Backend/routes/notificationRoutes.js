const express = require("express");
const controller = require("../controllers/notificationController");
const { authenticate } = require("../middleware/auth");
const router = express.Router();
router.use(authenticate);
router.get("/", controller.getNotifications);
router.put("/:id/read", controller.markRead);
module.exports = router;
