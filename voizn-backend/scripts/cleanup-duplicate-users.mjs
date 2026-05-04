import "dotenv/config";
import { AccessStatus } from "@prisma/client";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function scoreUser(user) {
  return [
    user.accessStatus === AccessStatus.APPROVED ? 1 : 0,
    user.isEmailVerified ? 1 : 0,
    new Date(user.updatedAt).getTime(),
  ];
}

function compareUsers(a, b) {
  const [aApproved, aVerified, aUpdated] = scoreUser(a);
  const [bApproved, bVerified, bUpdated] = scoreUser(b);

  if (aApproved !== bApproved) return bApproved - aApproved;
  if (aVerified !== bVerified) return bVerified - aVerified;
  return bUpdated - aUpdated;
}

async function moveFavorites(fromUserId, toUserId) {
  const favorites = await prisma.favorite.findMany({
    where: { userId: fromUserId },
  });

  for (const favorite of favorites) {
    const existing = await prisma.favorite.findUnique({
      where: {
        userId_productId: {
          userId: toUserId,
          productId: favorite.productId,
        },
      },
    });

    if (existing) {
      console.log(
        `[cleanup:duplicate-users] dropping duplicate favorite ${favorite.id} (${favorite.productId}) from ${fromUserId}`,
      );
      if (!dryRun) {
        await prisma.favorite.delete({ where: { id: favorite.id } });
      }
      continue;
    }

    console.log(
      `[cleanup:duplicate-users] moving favorite ${favorite.id} (${favorite.productId}) ${fromUserId} -> ${toUserId}`,
    );
    if (!dryRun) {
      await prisma.favorite.update({
        where: { id: favorite.id },
        data: { userId: toUserId },
      });
    }
  }
}

async function moveIdentities(fromUserId, toUserId) {
  const identities = await prisma.authIdentity.findMany({
    where: { userId: fromUserId },
  });

  for (const identity of identities) {
    const existing = await prisma.authIdentity.findUnique({
      where: {
        provider_providerAccountId: {
          provider: identity.provider,
          providerAccountId: identity.providerAccountId,
        },
      },
    });

    if (existing && existing.userId !== fromUserId) {
      console.log(
        `[cleanup:duplicate-users] dropping duplicate identity ${identity.id} (${identity.provider}:${identity.providerAccountId}) from ${fromUserId}`,
      );
      if (!dryRun) {
        await prisma.authIdentity.delete({ where: { id: identity.id } });
      }
      continue;
    }

    console.log(
      `[cleanup:duplicate-users] moving identity ${identity.id} ${fromUserId} -> ${toUserId}`,
    );
    if (!dryRun) {
      await prisma.authIdentity.update({
        where: { id: identity.id },
        data: { userId: toUserId },
      });
    }
  }
}

async function mergeUserGroup(users) {
  const sorted = [...users].sort(compareUsers);
  const keep = sorted[0];
  const duplicates = sorted.slice(1);

  console.log(
    `[cleanup:duplicate-users] keeping ${keep.id} <${keep.email}> (${keep.accessStatus}, verified=${keep.isEmailVerified})`,
  );

  for (const duplicate of duplicates) {
    console.log(
      `[cleanup:duplicate-users] merging duplicate ${duplicate.id} <${duplicate.email}> into ${keep.id}`,
    );

    await moveFavorites(duplicate.id, keep.id);
    await moveIdentities(duplicate.id, keep.id);

    if (!dryRun) {
      await prisma.user.updateMany({
        where: { approvedById: duplicate.id },
        data: { approvedById: keep.id },
      });

      await prisma.order.updateMany({
        where: { userId: duplicate.id },
        data: { userId: keep.id },
      });

      await prisma.verificationCode.updateMany({
        where: { userId: duplicate.id },
        data: { userId: keep.id },
      });

      await prisma.user.delete({
        where: { id: duplicate.id },
      });
    }

    console.log(
      `[cleanup:duplicate-users] deleted duplicate user ${duplicate.id} <${duplicate.email}>`,
    );
  }
}

async function main() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      accessStatus: true,
      isEmailVerified: true,
      updatedAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const grouped = new Map();
  for (const user of users) {
    const key = normalizeEmail(user.email);
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push(user);
  }

  const duplicateGroups = [...grouped.entries()].filter(
    ([, group]) => group.length > 1,
  );

  if (!duplicateGroups.length) {
    console.log("[cleanup:duplicate-users] no duplicate normalized emails found.");
    return;
  }

  console.log(
    `[cleanup:duplicate-users] ${dryRun ? "dry-run" : "live"} mode - found ${duplicateGroups.length} duplicate email group(s).`,
  );

  for (const [, group] of duplicateGroups) {
    await mergeUserGroup(group);
  }
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
