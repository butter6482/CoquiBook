import { makeUserActor } from "@calcom/features/booking-audit/lib/makeActor";

import { MembershipRole } from "@calcom/prisma/enums";
import authedProcedure from "../../../procedures/authedProcedure";
import { createTeamPbacProcedure } from "../../../procedures/pbacProcedures";
import publicProcedure from "../../../procedures/publicProcedure";
import { router } from "../../../trpc";
import { ZAddGuestsInputSchema } from "./addGuests.schema";
import { ZConfirmInputSchema } from "./confirm.schema";
import { ZEditLocationInputSchema } from "./editLocation.schema";
import { ZFindInputSchema } from "./find.schema";
import { ZGetInputSchema } from "./get.schema";
import { ZGetBookingAttendeesInputSchema } from "./getBookingAttendees.schema";
import { ZGetBookingDetailsInputSchema } from "./getBookingDetails.schema";
import { ZGetBookingHistoryInputSchema } from "./getBookingHistory.schema";
import { ZInstantBookingInputSchema } from "./getInstantBookingLocation.schema";
import { ZGetRoutingTraceInputSchema } from "./getRoutingTrace.schema";
import { ZGetWrongAssignmentReportsInputSchema } from "./getWrongAssignmentReports.schema";
import { ZHasWrongAssignmentReportInputSchema } from "./hasWrongAssignmentReport.schema";
import { ZReportBookingInputSchema } from "./reportBooking.schema";
import { ZReportWrongAssignmentInputSchema } from "./reportWrongAssignment.schema";
import { ZRequestRescheduleInputSchema } from "./requestReschedule.schema";
import { ZUpdateWrongAssignmentReportStatusInputSchema } from "./updateWrongAssignmentReportStatus.schema";
import { z } from "zod";
import { ZCreateManualBookingInputSchema } from "./createManual.schema";
import { ZGetDayBookingsInputSchema } from "./getDayBookings.schema";
import { ZUpdateManualBookingInputSchema } from "./updateManualBooking.schema";
import { bookingsProcedure } from "./util";
export const bookingsRouter = router({
  cancelBooking: authedProcedure
    .input(z.object({ uid: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const { prisma } = ctx;
      await prisma.booking.update({
        where: { uid: input.uid },
        data: { status: "CANCELLED" },
      });
      return { success: true };
    }),

  saveDailyTip: authedProcedure
    .input(z.object({ date: z.string(), staffUserId: z.number(), amount: z.number().min(0) }))
    .mutation(async ({ input, ctx }) => {
      const { prisma } = ctx;
      await prisma.salonDailyTip.upsert({
        where: { date_staffUserId: { date: input.date, staffUserId: input.staffUserId } },
        create: { date: input.date, staffUserId: input.staffUserId, amount: input.amount },
        update: { amount: input.amount },
      });
      return { success: true };
    }),

  getWeeklyTips: authedProcedure
    .input(z.object({ startDate: z.string(), endDate: z.string() }))
    .query(async ({ input, ctx }) => {
      const { prisma } = ctx;
      const tips = await prisma.salonDailyTip.findMany({
        where: { date: { gte: input.startDate, lte: input.endDate } },
      });
      // Returns: { [date]: { [staffUserId]: amount } }
      const result: Record<string, Record<number, number>> = {};
      for (const tip of tips) {
        if (!result[tip.date]) result[tip.date] = {};
        result[tip.date][tip.staffUserId] = tip.amount;
      }
      return result;
    }),

  listStaff: authedProcedure.query(async ({ ctx }) => {
    const { prisma, user } = ctx;
    // Return all team members the current user shares a team with (accepted memberships)
    const memberships = await prisma.membership.findMany({
      where: {
        userId: user.id,
        accepted: true,
        team: {
          members: { some: { accepted: true } },
        },
      },
      select: {
        team: {
          select: {
            members: {
              where: { accepted: true, role: "MEMBER" },
              select: {
                user: { select: { id: true, name: true, email: true, avatarUrl: true } },
              },
            },
          },
        },
      },
    });

    // Deduplicate by user id
    const seen = new Set<number>();
    const staff: { id: number; name: string | null; email: string; avatarUrl: string | null }[] = [];
    for (const m of memberships) {
      for (const member of m.team.members) {
        if (!seen.has(member.user.id)) {
          seen.add(member.user.id);
          staff.push(member.user);
        }
      }
    }
    return staff;
  }),

  getDayBookings: authedProcedure.input(ZGetDayBookingsInputSchema).query(async ({ input, ctx }) => {
    const { getDayBookingsHandler } = await import("./getDayBookings.handler");
    return getDayBookingsHandler({ ctx, input });
  }),

  createManual: authedProcedure.input(ZCreateManualBookingInputSchema).mutation(async ({ input, ctx }) => {
    const { createManualBookingHandler } = await import("./createManual.handler");

    return createManualBookingHandler({
      ctx,
      input,
    });
  }),

  updateManualBooking: authedProcedure.input(ZUpdateManualBookingInputSchema).mutation(async ({ input, ctx }) => {
    const { updateManualBookingHandler } = await import("./updateManualBooking.handler");
    return updateManualBookingHandler({ ctx, input });
  }),

  get: authedProcedure.input(ZGetInputSchema).query(async ({ input, ctx }) => {
    const { getHandler } = await import("./get.handler");

    return getHandler({
      ctx,
      input,
    });
  }),

  requestReschedule: authedProcedure.input(ZRequestRescheduleInputSchema).mutation(async ({ input, ctx }) => {
    const { requestRescheduleHandler } = await import("./requestReschedule.handler");

    return requestRescheduleHandler({
      ctx,
      input,
      source: "WEBAPP",
      impersonatedByUserUuid: ctx.session?.user?.impersonatedBy?.uuid ?? null,
    });
  }),

  editLocation:bookingsProcedure.input(ZEditLocationInputSchema).mutation(async ({ input, ctx }) => {
    const { editLocationHandler } = await import("./editLocation.handler");

    return editLocationHandler({
      ctx,
      input,
      actionSource: "WEBAPP",
      impersonatedByUserUuid: ctx.session?.user?.impersonatedBy?.uuid ?? null,
    });
  }),

  addGuests:authedProcedure.input(ZAddGuestsInputSchema).mutation(async ({ input, ctx }) => {
    const { addGuestsHandler } = await import("./addGuests.handler");

    return addGuestsHandler({
      ctx,
      input,
      actionSource: "WEBAPP",
      impersonatedByUserUuid: ctx.session?.user?.impersonatedBy?.uuid ?? null,
    });
  }),

  confirm:authedProcedure.input(ZConfirmInputSchema).mutation(async ({ input, ctx }) => {
    const { confirmHandler } = await import("./confirm.handler");

    return confirmHandler({
      ctx,
      input: {
        ...input,
        actor: makeUserActor(ctx.user.uuid),
        actionSource: "WEBAPP",
        impersonatedByUserUuid: ctx.session?.user?.impersonatedBy?.uuid ?? null,
      },
    });
  }),

  getBookingAttendees: authedProcedure
    .input(ZGetBookingAttendeesInputSchema)
    .query(async ({ input, ctx }) => {
      const { getBookingAttendeesHandler } = await import("./getBookingAttendees.handler");

      return getBookingAttendeesHandler({
        ctx,
        input,
      });
    }),

  getBookingDetails: authedProcedure.input(ZGetBookingDetailsInputSchema).query(async ({ input, ctx }) => {
    const { getBookingDetailsHandler } = await import("./getBookingDetails.handler");

    return getBookingDetailsHandler({
      ctx,
      input,
    });
  }),

  find: publicProcedure.input(ZFindInputSchema).query(async ({ input, ctx }) => {
    const { getHandler } = await import("./find.handler");

    return getHandler({
      ctx,
      input,
    });
  }),

  getInstantBookingLocation: publicProcedure
    .input(ZInstantBookingInputSchema)
    .query(async ({ input, ctx }) => {
      const { getHandler } = await import("./getInstantBookingLocation.handler");

      return getHandler({
        ctx,
        input,
      });
    }),

  reportBooking: authedProcedure.input(ZReportBookingInputSchema).mutation(async ({ input, ctx }) => {
    const { reportBookingHandler } = await import("./reportBooking.handler");

    return reportBookingHandler({
      ctx,
      input,
      impersonatedByUserUuid: ctx.session?.user?.impersonatedBy?.uuid ?? null,
      actionSource: "WEBAPP",
    });
  }),
  reportWrongAssignment: authedProcedure
    .input(ZReportWrongAssignmentInputSchema)
    .mutation(async ({ input, ctx }) => {
      const { reportWrongAssignmentHandler } = await import("./reportWrongAssignment.handler");

      return reportWrongAssignmentHandler({
        ctx,
        input,
      });
    }),
  hasWrongAssignmentReport: authedProcedure
    .input(ZHasWrongAssignmentReportInputSchema)
    .query(async ({ input, ctx }) => {
      const { hasWrongAssignmentReportHandler } = await import("./hasWrongAssignmentReport.handler");

      return hasWrongAssignmentReportHandler({
        ctx,
        input,
      });
    }),
  getBookingHistory: authedProcedure.input(ZGetBookingHistoryInputSchema).query(async ({ input, ctx }) => {
    const { getBookingHistoryHandler } = await import("./getBookingHistory.handler");

    return getBookingHistoryHandler({
      ctx,
      input,
    });
  }),
  getRoutingTrace: authedProcedure.input(ZGetRoutingTraceInputSchema).query(async ({ input, ctx }) => {
    const { getRoutingTraceHandler } = await import("./getRoutingTrace.handler");

    return getRoutingTraceHandler({
      ctx,
      input,
    });
  }),
  getWrongAssignmentReports: createTeamPbacProcedure("booking.readTeamBookings", [
    MembershipRole.ADMIN,
    MembershipRole.OWNER,
    MembershipRole.MEMBER,
  ])
    .input(ZGetWrongAssignmentReportsInputSchema)
    .query(async ({ input }) => {
      const { getWrongAssignmentReportsHandler } = await import("./getWrongAssignmentReports.handler");

      return getWrongAssignmentReportsHandler({
        input,
      });
    }),
  updateWrongAssignmentReportStatus: authedProcedure
    .input(ZUpdateWrongAssignmentReportStatusInputSchema)
    .mutation(async ({ input, ctx }) => {
      const { updateWrongAssignmentReportStatusHandler } = await import(
        "./updateWrongAssignmentReportStatus.handler"
      );

      return updateWrongAssignmentReportStatusHandler({
        ctx,
        input,
      });
    }),
});
