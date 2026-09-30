const express = require("express");
const controller = require("../controllers/trackingController");
const { authenticate } = require("../middleware/auth");
const { requireRoles } = require("../middleware/roles");
const router = express.Router();
router.get("/:trackingId", authenticate, controller.getTracking);
router.put("/orders/:orderId", authenticate, requireRoles("admin", "staff"), (req, res, next) => {
    req.params.id = req.params.orderId;
    return require('../controllers/orderController').updateOrderStatus(req, res).catch(next);
});
module.exports = router;
