import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export function signToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role,
    },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn },
  );
}

export function signPurposeToken(payload, expiresIn) {
  return jwt.sign(payload, env.jwtSecret, { expiresIn });
}

export function verifyToken(token) {
  return jwt.verify(token, env.jwtSecret);
}
