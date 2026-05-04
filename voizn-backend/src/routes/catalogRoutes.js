import { Router } from "express";
import {
  getDrops,
  getProduct,
  getProducts,
  signupBackInStock,
  signupDropNotification,
} from "../controllers/catalogController.js";

const router = Router();

router.get("/products", getProducts);
router.get("/products/:slug", getProduct);
router.get("/drops", getDrops);
router.post("/back-in-stock", signupBackInStock);
router.post("/drop-notifications", signupDropNotification);

export default router;
