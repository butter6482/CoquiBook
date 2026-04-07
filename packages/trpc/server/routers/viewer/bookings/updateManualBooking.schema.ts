import { z } from "zod";

export const ZUpdateManualBookingInputSchema = z.object({
  bookingUid: z.string(),
  serviceName: z.string().min(1, "Servicio es requerido"),
  customerName: z.string().min(1, "Nombre del cliente es requerido"),
  customerPhone: z.string().optional(),
  customerEmail: z.string().email().optional().or(z.literal("")),
  // PR local time → UTC: same preprocessing as createManual
  startTime: z.preprocess((val) => {
    if (typeof val === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(val)) {
      const [datePart, timePart] = (val as string).split("T");
      const [year, month, day] = datePart.split("-").map(Number);
      const [hours, minutes] = timePart.split(":").map(Number);
      const utcMs = Date.UTC(year, month - 1, day, hours + 4, minutes, 0);
      return new Date(utcMs).toISOString();
    }
    return val;
  }, z.string().datetime()),
  durationMinutes: z.number().min(15).max(480),
  staffUserId: z.number().optional(),
  salonPrice: z.number().min(0).optional(),
  notes: z.string().optional(),
});

export type TUpdateManualBookingInput = z.infer<typeof ZUpdateManualBookingInputSchema>;
