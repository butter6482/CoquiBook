import { z } from "zod";

export const ZCreateManualBookingInputSchema = z.object({
  serviceName: z.string().min(1, "El servicio es requerido"),
  startTime: z.preprocess((val) => {
    // Normalize datetime-local format "YYYY-MM-DDTHH:mm" → ISO 8601 (UTC)
    // Puerto Rico is always UTC-4 (no DST). Add 4 hours to convert PR local → UTC.
    if (typeof val === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(val)) {
      const [datePart, timePart] = val.split("T");
      const [year, month, day] = datePart.split("-").map(Number);
      const [hours, minutes] = timePart.split(":").map(Number);
      // Date.UTC avoids any server-local-timezone interpretation
      const utcMs = Date.UTC(year, month - 1, day, hours + 4, minutes, 0);
      return new Date(utcMs).toISOString();
    }
    return val;
  }, z.string().datetime()),
  customerName: z.string().min(1, "Customer name is required"),
  customerPhone: z.string().optional(),
  customerEmail: z.string().email().optional().or(z.literal("")),
  notes: z.string().optional(),
  customerTimezone: z.string().default("America/Puerto_Rico"),
  staffUserId: z.number().int().positive().optional(),
  durationMinutes: z.number().int().min(5).default(60),
  salonPrice: z.number().min(0, "El precio es requerido"),
});

export type TCreateManualBookingInput = z.infer<typeof ZCreateManualBookingInputSchema>;
