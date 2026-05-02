import { AccessStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { sanitizeUser } from "../services/userService.js";
import { asyncHandler } from "../utils/http.js";

export const listPendingAccessUsers = asyncHandler(async (_request, response) => {
  const pendingUsers = await prisma.user.findMany({
    where: {
      accessStatus: AccessStatus.PENDING_APPROVAL,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  response.json({
    ok: true,
    pendingUsers: pendingUsers.map(sanitizeUser),
  });
});
