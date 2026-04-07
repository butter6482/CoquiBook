import { z } from "zod";

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

export const ZGetDayBookingsInputSchema = z.object({
  date: z.string().regex(dateRegex, "Date must be YYYY-MM-DD"),
  // Optional end date to fetch a range (e.g. a full week Mon–Sat)
  endDate: z.string().regex(dateRegex).optional(),
  timezone: z.string().default("America/Puerto_Rico"),
});

export type TGetDayBookingsInput = z.infer<typeof ZGetDayBookingsInputSchema>;
