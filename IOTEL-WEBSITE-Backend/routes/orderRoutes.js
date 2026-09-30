const express = require("express");
const controller = require("../controllers/orderController");
const { authenticate } = require("../middleware/auth");
const { requireRoles } = require("../middleware/roles");

const router = express.Router();

router.use(authenticate);
router.post("/", controller.createOrder);
router.get("/", controller.getOrders);
router.get("/:id", controller.getOrderById);
router.put("/:id/cancel", controller.cancelOrder);
router.put("/:id/status", requireRoles("admin", "staff"), controller.updateOrderStatus);

module.exports = router;
