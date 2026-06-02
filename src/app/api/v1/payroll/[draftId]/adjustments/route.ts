import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { ApiResponse } from "@/server/utils/api-response";
import { AuthUtils } from "@/server/utils/auth";
import { AppError } from "@/server/utils/errors";
import { db, payrollDrafts, users } from "@/server/db";

const AdjustmentSchema = z.object({
  employeeId: z.string().uuid(),
  type: z.enum(["bonus", "deduction"]),
  amount: z.number().positive(),
  action: z.enum(["add", "remove"]).default("add"),
  reason: z.string().trim().max(255).optional(),
});
const DraftParamsSchema = z.object({
  draftId: z.string().uuid(),
});

type AdjustmentInput = z.infer<typeof AdjustmentSchema>;
type AdjustmentType = AdjustmentInput["type"];

type PayrollEmployeePayload = Record<string, unknown> & {
  id?: string;
  employeeId?: string;
  netPay?: number;
  bonus?: number;
  bonuses?: number;
  deduction?: number;
  deductions?: number;
  adjustments?: PayrollAdjustment[];
};

type PayrollAdjustment = {
  id: string;
  type: AdjustmentType;
  amount: number;
  reason?: string;
  createdAt: string;
};

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function getEmployeeId(employee: PayrollEmployeePayload): string | undefined {
  if (typeof employee.employeeId === "string") {
    return employee.employeeId;
  }

  if (typeof employee.id === "string") {
    return employee.id;
  }

  return undefined;
}

function getAdjustmentTotal(
  employee: PayrollEmployeePayload,
  type: AdjustmentType,
): number {
  const directValue =
    type === "bonus"
      ? (employee.bonus ?? employee.bonuses)
      : (employee.deduction ?? employee.deductions);

  if (directValue !== undefined && directValue !== null) {
    return toNumber(directValue);
  }

  return (employee.adjustments ?? [])
    .filter((adjustment) => adjustment.type === type)
    .reduce((total, adjustment) => total + toNumber(adjustment.amount), 0);
}

function getBasePay(employee: PayrollEmployeePayload): number {
  const knownBasePay =
    employee.basePay ??
    employee.grossPay ??
    employee.grossAmount ??
    employee.salary ??
    employee.amount;

  const basePay = toNumber(knownBasePay);
  if (basePay > 0) {
    return basePay;
  }

  return (
    toNumber(employee.netPay) -
    getAdjustmentTotal(employee, "bonus") +
    getAdjustmentTotal(employee, "deduction")
  );
}

function applyAdjustment(
  employee: PayrollEmployeePayload,
  input: AdjustmentInput,
): PayrollEmployeePayload {
  const bonusTotal = getAdjustmentTotal(employee, "bonus");
  const deductionTotal = getAdjustmentTotal(employee, "deduction");
  const currentTotal = input.type === "bonus" ? bonusTotal : deductionTotal;

  if (input.action === "remove" && input.amount > currentTotal) {
    throw new Error(`Cannot remove more ${input.type} than currently applied`);
  }

  const nextBonusTotal =
    input.type === "bonus"
      ? input.action === "add"
        ? bonusTotal + input.amount
        : bonusTotal - input.amount
      : bonusTotal;
  const nextDeductionTotal =
    input.type === "deduction"
      ? input.action === "add"
        ? deductionTotal + input.amount
        : deductionTotal - input.amount
      : deductionTotal;

  const existingAdjustments = employee.adjustments ?? [];
  const adjustments =
    input.action === "add"
      ? [
          ...existingAdjustments,
          {
            id: randomUUID(),
            type: input.type,
            amount: input.amount,
            reason: input.reason,
            createdAt: new Date().toISOString(),
          },
        ]
      : existingAdjustments;

  const netPay = getBasePay(employee) + nextBonusTotal - nextDeductionTotal;

  return {
    ...employee,
    employeeId: getEmployeeId(employee),
    bonus: nextBonusTotal,
    bonuses: nextBonusTotal,
    deduction: nextDeductionTotal,
    deductions: nextDeductionTotal,
    netPay,
    adjustments,
  };
}

function recalculateDraftTotal(employeesPayload: PayrollEmployeePayload[]) {
  return employeesPayload.reduce(
    (total, employee) => total + toNumber(employee.netPay),
    0,
  );
}

async function handleAdjustment(
  req: NextRequest,
  context: { params: Promise<{ draftId: string }> },
) {
  try {
    const { draftId } = await context.params;
    const { userId } = await AuthUtils.authenticateRequestOrRefreshCookie(req);

    const parsedParams = DraftParamsSchema.safeParse({ draftId });
    if (!parsedParams.success) {
      return ApiResponse.error(
        "Invalid payroll draft ID",
        400,
        parsedParams.error.flatten().fieldErrors,
        req,
      );
    }

    const body = await req.json();
    const parsed = AdjustmentSchema.safeParse(body);

    if (!parsed.success) {
      return ApiResponse.error(
        "Invalid request body",
        400,
        parsed.error.flatten().fieldErrors,
        req,
      );
    }

    const [user] = await db
      .select({ organizationId: users.organizationId })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user?.organizationId) {
      return ApiResponse.error(
        "User is not associated with any organization",
        403,
        null,
        req,
      );
    }
    const organizationId = user.organizationId;

    const updatedDraft = await db.transaction(async (tx) => {
      const [draft] = await tx
        .select({
          id: payrollDrafts.id,
          employeesPayload: payrollDrafts.employeesPayload,
        })
        .from(payrollDrafts)
        .where(
          and(
            eq(payrollDrafts.id, parsedParams.data.draftId),
            eq(payrollDrafts.organizationId, organizationId),
            eq(payrollDrafts.status, "active"),
          ),
        )
        .limit(1);

      if (!draft) {
        return null;
      }

      const employeesPayload = Array.isArray(draft.employeesPayload)
        ? (draft.employeesPayload as PayrollEmployeePayload[])
        : [];
      let employeeFound = false;

      const nextEmployeesPayload = employeesPayload.map((employee) => {
        if (getEmployeeId(employee) !== parsed.data.employeeId) {
          return employee;
        }

        employeeFound = true;
        return applyAdjustment(employee, parsed.data);
      });

      if (!employeeFound) {
        throw new Error("Employee was not found in this payroll draft");
      }

      const totalAmount = recalculateDraftTotal(nextEmployeesPayload);
      const [updated] = await tx
        .update(payrollDrafts)
        .set({
          employeesPayload: nextEmployeesPayload,
          totalAmount,
          updatedAt: new Date(),
        })
        .where(eq(payrollDrafts.id, draft.id))
        .returning();

      return updated;
    });

    if (!updatedDraft) {
      return ApiResponse.error(
        "Active payroll draft not found",
        404,
        null,
        req,
      );
    }

    return ApiResponse.success(
      updatedDraft,
      "Payroll adjustment applied successfully",
    );
  } catch (error) {
    if (error instanceof AppError) {
      return ApiResponse.error(
        error.message,
        error.statusCode,
        error.errors,
        req,
      );
    }

    if (
      error instanceof Error &&
      (error.message.includes("Employee was not found") ||
        error.message.includes("Cannot remove more"))
    ) {
      return ApiResponse.error(error.message, 400, null, req);
    }

    console.error("[Payroll Adjustments Error]", error);
    return ApiResponse.error("Internal server error", 500, null, req);
  }
}

/**
 * @swagger
 * /payroll/{draftId}/adjustments:
 *   post:
 *     summary: Apply a payroll draft adjustment
 *     description: Adds a one-time bonus or custom deduction to an employee in an active payroll draft.
 *     tags: [Payroll]
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ draftId: string }> },
) {
  return handleAdjustment(req, context);
}

/**
 * @swagger
 * /payroll/{draftId}/adjustments:
 *   patch:
 *     summary: Add or remove a payroll draft adjustment
 *     description: Adds or removes a one-time bonus or custom deduction from an employee in an active payroll draft.
 *     tags: [Payroll]
 */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ draftId: string }> },
) {
  return handleAdjustment(req, context);
}
