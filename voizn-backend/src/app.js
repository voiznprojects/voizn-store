import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import authRoutes from "./routes/authRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import favoriteRoutes from "./routes/favoriteRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import profileRoutes from "./routes/profileRoutes.js";
import { attachCurrentUser } from "./middleware/auth.js";
import { env, isAllowedOrigin } from "./config/env.js";
import { jsonError } from "./utils/http.js";

const app = express();

app.use(
  cors({
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`Origin ${origin} is not allowed by CORS.`));
    },
    credentials: true,
  }),
);
app.use(express.json());
app.use(cookieParser());
app.use(attachCurrentUser);

app.get("/api/health", (_request, response) => {
  response.json({ ok: true });
});

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/favorites", favoriteRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/profile", profileRoutes);

app.use((error, _request, response, _next) => {
  console.error(error);
  jsonError(
    response,
    error.statusCode || 500,
    error.message || "Something went wrong on the VOIZN server.",
    error.code || "server_error",
  );
});

export { app, env };
