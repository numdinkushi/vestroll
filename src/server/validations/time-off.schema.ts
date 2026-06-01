import { z } from "zod";

const TimeOffStatusSchema = z
  .enum(["Approved", "Rejected", "approved", "rejected"])
  .transform((value) => value.toLowerCase() as "approved" | "rejected")
  .describe(
    "Decision applied to a time-off request. Case-insensitive — both 'Approved' and 'approved' are accepted. Normalised to lowercase after validation. 'approved' = request granted and calendar blocked; 'rejected' = request denied.",
  );

export const UpdateTimeOffStatusBodySchema = z
  .object({
    status: TimeOffStatusSchema,
    reason: z
      .string()
      .trim()
      .max(500, "Reason must be 500 characters or fewer")
      .optional()
      .describe(
        "Optional explanation from the reviewer for the approval or rejection decision (max 500 characters). Strongly recommended when rejecting so the employee knows why.",
      ),
  })
  .describe(
    "Request body for an HR manager or admin to approve or reject a pending time-off request.",
  );

export type UpdateTimeOffStatusBody = z.infer<
  typeof UpdateTimeOffStatusBodySchema
>;

export const TimeOffRequestSchema = z
  .object({
    employeeId: z
      .string()
      .min(1, "Invalid employee ID")
      .optional()
      .describe(
        "UUID of the employee submitting the time-off request. Optional when the authenticated user is submitting on their own behalf; required when an admin creates a request on behalf of another employee.",
      ),
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "startDate must be YYYY-MM-DD")
      .describe(
        "First day of the requested leave period in ISO 8601 date format (YYYY-MM-DD, e.g. '2025-07-01'). Must be on or after today's date.",
      ),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "endDate must be YYYY-MM-DD")
      .describe(
        "Last day of the requested leave period in ISO 8601 date format (YYYY-MM-DD, e.g. '2025-07-05'). Must be on or after startDate.",
      ),
    reason: z
      .string()
      .min(1, "Reason is required")
      .max(500, "Reason too long")
      .optional()
      .describe(
        "Employee's reason for taking leave (max 500 characters). Visible to HR managers during review. Optional but encouraged, especially for unplanned absences.",
      ),
    leaveType: z
      .enum(["vacation", "sick", "personal", "other"])
      .default("vacation")
      .describe(
        "Category of the leave request. 'vacation' = planned annual leave; 'sick' = illness or medical appointment; 'personal' = personal matters not covered by vacation or sick leave; 'other' = any other reason. Defaults to 'vacation'.",
      ),
  })
  .describe(
    "Request body for submitting a new time-off (leave) request. startDate and endDate must both be in YYYY-MM-DD format and endDate must not precede startDate.",
  );

export type TimeOffRequestInput = z.infer<typeof TimeOffRequestSchema>;
