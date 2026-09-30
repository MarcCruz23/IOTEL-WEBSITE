const express = require("express");
const controller = require("../controllers/productController");
const { authenticate } = require("../middleware/auth");
const { requireRoles } = require("../middleware/roles");

const router = express.Router();

router.get("/", controller.getProducts);
router.get("/:id", controller.getProductById);
router.post("/", authenticate, requireRoles("admin"), controller.createProduct);
router.put("/:id", authenticate, requireRoles("admin"), controller.updateProduct);
router.delete("/:id", authenticate, requireRoles("admin"), controller.deactivateProduct);

module.exports = router;
