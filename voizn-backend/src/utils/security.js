import crypto from "node:crypto";
import bcrypt from "bcryptjs";

export function createNumericCode() {
  return String(crypto.randomInt(100000, 1_000_000)).padStart(6, "0");
}

export function hashValue(value) {
  return bcrypt.hash(String(value), 12);
}

export function compareValue(value, hash) {
  return bcrypt.compare(String(value), hash);
}
