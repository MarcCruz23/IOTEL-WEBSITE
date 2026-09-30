const express = require("express");
const { getDashboard } = require("../controllers/adminController");
const { authenticate } = require("../middleware/auth");
const { requireRoles } = require("../middleware/roles");
const router = express.Router();
router.get("/dashboard", authenticate, requireRoles("admin"), getDashboard);
module.exports = router;
