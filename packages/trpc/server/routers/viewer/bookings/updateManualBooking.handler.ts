import dayjs from "@calcom/dayjs";
import { HttpError } from "@calcom/lib/http-error";
import { prisma } from "@calcom/prisma";

import type { TrpcSessionUser } from "../../../types";
import type { TUpdateManualBookingInput } from "./updateManualBooking.schema";

type UpdateManualBookingOptions = {
  ctx: { user: NonNullable<TrpcSessionUser> };
  input: TUpdateManualBookingInput;
};

export const updateManualBookingHandler = async ({ ctx, input }: UpdateManualBookingOptions) => {
  const { user } = ctx;
  const {
    bookingUid,
    serviceName,
    customerName,
    customerPhone,
    customerEmail,
    startTime,
    durationMinutes,
    staffUserId,
    salonPrice,
    notes,
  } = input;

  const booking = await prisma.booking.findUnique({
    where: { uid: bookingUid },
    select: {
      id: true,
      uid: true,
      userId: true,
      attendees: { select: { id: true, email: true } },
    },
  });

  if (!booking) {
    throw new HttpError({ statusCode: 404, message: "Cita no encontrada." });
  }

  // Verify the calling user owns the booking or is an OWNER/ADMIN of a shared team
  if (booking.userId !== user.id) {
    const sharedTeam = await prisma.membership.findFirst({
      where: {
        userId: user.id,
        accepted: true,
        role: { in: ["OWNER", "ADMIN"] },
        team: {
          members: { some: { userId: booking.userId ?? 0, accepted: true } },
        },
      },
    });
    if (!sharedTeam) {
      throw new HttpError({ statusCode: 403, message: "No tienes permiso para editar esta cita." });
    }
  }

  // Resolve target staff user
  let targetUserId = booking.userId ?? user.id;
  if (staffUserId && staffUserId !== booking.userId) {
    const hasAccess = await prisma.membership.findFirst({
      where: {
        userId: user.id,
        accepted: true,
        role: { in: ["OWNER", "ADMIN"] },
        team: {
          members: { some: { userId: staffUserId, accepted: true } },
        },
      },
    });
    if (!hasAccess) {
      throw new HttpError({ statusCode: 403, message: "No puedes asignar a esta empleada." });
    }
    targetUserId = staffUserId;
  }

  const start = dayjs.utc(startTime);
  const end = start.add(durationMinutes, "minute");

  await prisma.booking.update({
    where: { uid: bookingUid },
    data: {
      title: `${serviceName} - ${customerName}`,
      startTime: start.toDate(),
      endTime: end.toDate(),
      userId: targetUserId,
      description: notes || null,
      salonPrice: salonPrice ?? null,
    },
  });

  // Update first attendee
  const attendee = booking.attendees[0];
  if (attendee) {
    const existingEmail = attendee.email;
    const newEmail =
      customerEmail ||
      (customerPhone ? `${customerPhone}@manual.coquibook.local` : existingEmail);

    await prisma.attendee.update({
      where: { id: attendee.id },
      data: {
        name: customerName,
        email: newEmail,
        phoneNumber: customerPhone || null,
      },
    });
  }

  return { success: true };
};
