import { Router } from "express";
import { requestOtp, verifyOtp, signup, getMe, logout } from "../controllers/auth.controller.js";
import { optionalAuth } from "../middleware/auth.middleware.js";

const router = Router();

router.post("/request-otp", requestOtp);
router.post("/verify-otp", verifyOtp);
router.post("/signup", signup);
router.get("/me", optionalAuth, getMe);
router.post("/logout", logout);

export default router;
