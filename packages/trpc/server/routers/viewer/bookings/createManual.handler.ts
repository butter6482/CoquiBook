import { v4 as uuidv4 } from "uuid";

import dayjs from "@calcom/dayjs";
import { HttpError } from "@calcom/lib/http-error";
import logger from "@calcom/lib/logger";
import { prisma } from "@calcom/prisma";
import { BookingStatus } from "@calcom/prisma/enums";

import type { TrpcSessionUser } from "../../../types";
import type { TCreateManualBookingInput } from "./createManual.schema";

const log = logger.getSubLogger({ prefix: ["createManualBooking"] });

type CreateManualBookingOptions = {
  ctx: {
    user: NonNullable<TrpcSessionUser>;
  };
  input: TCreateManualBookingInput;
};

export const createManualBookingHandler = async ({ ctx, input }: CreateManualBookingOptions) => {
  const { user } = ctx;
  const { serviceName, startTime, customerName, customerPhone, customerEmail, notes, customerTimezone, staffUserId, durationMinutes, salonPrice } =
    input;

  // Determine which user this booking is for
  let bookingUserId = user.id;
  let bookingUserEmail = user.email;

  if (staffUserId && staffUserId !== user.id) {
    // Verify current user is an owner/admin of a shared team
    const sharedTeam = await prisma.membership.findFirst({
      where: {
        userId: user.id,
        accepted: true,
        role: { in: ["OWNER", "ADMIN"] },
        team: {
          members: {
            some: { userId: staffUserId, accepted: true },
          },
        },
      },
      select: { id: true },
    });

    if (!sharedTeam) {
      throw new HttpError({
        statusCode: 403,
        message: "You do not have permission to create bookings for this staff member.",
      });
    }

    const staffUser = await prisma.user.findUnique({
      where: { id: staffUserId },
      select: { id: true, email: true },
    });

    if (!staffUser) {
      throw new HttpError({ statusCode: 404, message: "Staff member not found." });
    }

    bookingUserId = staffUser.id;
    bookingUserEmail = staffUser.email;
  }

  const start = dayjs.utc(startTime);
  const end = start.add(durationMinutes, "minutes");

  const uid = uuidv4();

  const booking = await prisma.booking.create({
    data: {
      uid,
      title: `${serviceName} - ${customerName}`,
      startTime: start.toDate(),
      endTime: end.toDate(),
      status: BookingStatus.ACCEPTED,
      user: {
        connect: { id: bookingUserId },
      },
      userPrimaryEmail: bookingUserEmail,
      description: notes || null,
      salonPrice: salonPrice ?? null,
      responses: {
        name: customerName,
        email: customerEmail || "",
        phone: customerPhone,
        notes: notes || "",
      },
      attendees: {
        create: {
          name: customerName,
          email: customerEmail || (customerPhone ? `${customerPhone}@manual.coquibook.local` : `${uid}@manual.coquibook.local`),
          timeZone: customerTimezone,
          phoneNumber: customerPhone || null,
          locale: "es",
        },
      },
    },
    select: {
      id: true,
      uid: true,
      title: true,
      startTime: true,
      endTime: true,
      status: true,
      attendees: {
        select: {
          name: true,
          email: true,
          phoneNumber: true,
        },
      },
    },
  });

  log.info(`Manual booking created: ${booking.uid} by user ${user.id} for service "${serviceName}"`);

  return booking;
};
