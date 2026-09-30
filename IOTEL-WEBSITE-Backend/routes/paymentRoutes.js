const express = require("express");
const controller = require("../controllers/paymentController");
const { authenticate } = require("../middleware/auth");
const { requireRoles } = require("../middleware/roles");

const router = express.Router();

router.post("/orders/:orderId/bank-transfer", authenticate, controller.submitBankTransfer);
router.get("/", authenticate, requireRoles("admin"), controller.getPayments);
router.put("/:paymentId/status", authenticate, requireRoles("admin"), controller.reviewPayment);

module.exports = router;
