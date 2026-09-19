import express from "express";

const router = express.Router();

function deprecatedDeliveryRoute(req, res) {
  return res.status(410).json({
    success: false,
    error: "Legacy /api/delivery routes are retired. Use /api/vendor/assign-delivery for vendor assignment and /api/rider routes for delivery staff actions.",
  });
}

router.post("/add", deprecatedDeliveryRoute);
router.post("/assign", deprecatedDeliveryRoute);
router.post("/status", deprecatedDeliveryRoute);
router.all("*", (req, res) => {
  return res.status(410).json({
    success: false,
    error: "Legacy /api/delivery routes are retired.",
  });
});

export default router;
