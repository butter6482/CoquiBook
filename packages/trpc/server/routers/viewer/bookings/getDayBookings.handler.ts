import dayjs from "@calcom/dayjs";
import { prisma } from "@calcom/prisma";
import { BookingStatus } from "@calcom/prisma/enums";

import type { TrpcSessionUser } from "../../../types";
import type { TGetDayBookingsInput } from "./getDayBookings.schema";

type GetDayBookingsOptions = {
  ctx: {
    user: NonNullable<TrpcSessionUser>;
  };
  input: TGetDayBookingsInput;
};

export const getDayBookingsHandler = async ({ ctx, input }: GetDayBookingsOptions) => {
  const { user } = ctx;
  const { date, timezone, endDate } = input;

  // Support single day OR date range (e.g. full week Mon–Sat)
  const startOfRange = dayjs.tz(date, timezone).startOf("day").toDate();
  const endOfRange = endDate
    ? dayjs.tz(endDate, timezone).endOf("day").toDate()
    : dayjs.tz(date, timezone).endOf("day").toDate();

  // Find teams where the current user is OWNER or ADMIN
  const adminMemberships = await prisma.membership.findMany({
    where: {
      userId: user.id,
      accepted: true,
      role: { in: ["OWNER", "ADMIN"] },
    },
    select: { teamId: true },
  });

  const adminTeamIds = adminMemberships.map((m) => m.teamId);

  // Gather all user IDs accessible via those teams (includes staff + admin themselves)
  let accessibleUserIds: number[] = [user.id];

  if (adminTeamIds.length > 0) {
    const teamMembers = await prisma.membership.findMany({
      where: {
        teamId: { in: adminTeamIds },
        accepted: true,
      },
      select: { userId: true },
    });
    accessibleUserIds = [...new Set([user.id, ...teamMembers.map((m) => m.userId)])];
  }

  // Fetch all non-cancelled bookings for that day for accessible users
  // Exclude legacy/demo "meeting" bookings
  const bookings = await prisma.booking.findMany({
    where: {
      startTime: { gte: startOfRange, lte: endOfRange },
      status: { notIn: [BookingStatus.CANCELLED, BookingStatus.REJECTED] },
      userId: { in: accessibleUserIds },
      NOT: {
        title: { contains: "meeting", mode: "insensitive" },
      },
    },
    select: {
      id: true,
      uid: true,
      title: true,
      startTime: true,
      endTime: true,
      status: true,
      salonPrice: true,
      description: true,
      user: {
        select: { id: true, name: true, email: true },
      },
      attendees: {
        select: { name: true, email: true, phoneNumber: true },
      },
    },
    orderBy: { startTime: "asc" },
  });

  return bookings;
};
