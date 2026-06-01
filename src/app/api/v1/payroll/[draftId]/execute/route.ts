import { NextRequest } from "next/server";
import { ApiResponse } from "@/server/utils/api-response";
import { AppError } from "@/server/utils/errors";
import { AuthUtils } from "@/server/utils/auth";
import { db, payrolls, fiatTransactions } from "@/server/db";
import { eq, and } from "drizzle-orm";
import { users } from "@/server/db/schema";
import { z } from "zod";

const ExecuteDraftSchema = z.object({
  providerId: z.enum(["monnify", "flutterwave"]).default("monnify"),
});

/**
 * @swagger
 * /payroll/{draftId}/execute:
 *   post:
 *     summary: Finalize a draft payroll
 *     description: Finalizes a draft payroll, locks it, and queues fiat payout transactions.
 *     tags: [Payroll]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: draftId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the payroll draft to finalize
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               providerId:
 *                 type: string
 *                 enum: [monnify, flutterwave]
 *                 default: monnify
 *     responses:
 *       200:
 *         description: Payroll finalized successfully
 *       400:
 *         description: Invalid request or validation failed
 *       404:
 *         description: Draft payroll not found
 *       500:
 *         description: Internal server error
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ draftId: string }> } | { params: { draftId: string } }
) {
  try {
    const { userId } = await AuthUtils.authenticateRequestOrRefreshCookie(req);

    const [user] = await db
      .select({ organizationId: users.organizationId })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user?.organizationId) {
      return ApiResponse.error("User is not associated with any organization", 403);
    }

    const resolvedParams = await params;
    const { draftId } = resolvedParams;

    if (!draftId) {
      return ApiResponse.error("Draft ID is required", 400);
    }

    let body = {};
    try {
      body = await req.json();
    } catch {
      // Body is optional
    }

    const parsed = ExecuteDraftSchema.safeParse(body);
    if (!parsed.success) {
      return ApiResponse.error(
        "Invalid request body",
        400,
        parsed.error.flatten().fieldErrors,
      );
    }

    const providerId = parsed.data.providerId;

    // Retrieve the draft payroll
    const [draft] = await db
      .select()
      .from(payrolls)
      .where(
        and(
          eq(payrolls.id, draftId),
          eq(payrolls.organizationId, user.organizationId)
        )
      )
      .limit(1);

    if (!draft) {
      return ApiResponse.error("Draft payroll not found", 404);
    }

    if (draft.status !== "draft") {
      return ApiResponse.error("Only draft payrolls can be executed", 400);
    }

    const totalsData = draft.totals as any;
    if (!totalsData || !totalsData.employees || !Array.isArray(totalsData.employees)) {
      return ApiResponse.error("Invalid draft data format", 400);
    }

    // Verify the draft totals
    let calculatedNetPay = 0;
    for (const emp of totalsData.employees) {
      if (typeof emp.netPay === "number") {
        calculatedNetPay += emp.netPay;
      }
    }

    // Floating point comparison with a small epsilon
    const expectedNetPay = totalsData.totals?.netPay || 0;
    if (Math.abs(calculatedNetPay - expectedNetPay) > 0.01) {
      return ApiResponse.error("Draft totals verification failed", 400);
    }

    // Update the payroll status to processing
    await db
      .update(payrolls)
      .set({ status: "processing", updatedAt: new Date() })
      .where(eq(payrolls.id, draftId));

    // Queue the payout transactions
    const transactionsToInsert = totalsData.employees
      .filter((emp: any) => typeof emp.netPay === "number" && emp.netPay > 0)
      .map((emp: any) => ({
        organizationId: user.organizationId,
        amount: Math.round(emp.netPay * 100), // Assuming amount is in smallest currency unit (e.g., kobo/cents) if BigInt
        type: "payout" as const,
        status: "pending" as const,
        provider: providerId,
        providerReference: crypto.randomUUID(), // Generate a unique reference
        metadata: {
          payrollId: draftId,
          employeeId: emp.employeeId,
          grossPay: emp.grossPay,
          deductions: emp.deductions,
        },
      }));

    if (transactionsToInsert.length > 0) {
      await db.insert(fiatTransactions).values(transactionsToInsert);
    }

    // Update the payroll status to completed
    await db
      .update(payrolls)
      .set({ status: "completed", updatedAt: new Date() })
      .where(eq(payrolls.id, draftId));

    return ApiResponse.success(
      null,
      "Payroll draft finalized successfully and payouts queued"
    );
  } catch (error) {
    if (error instanceof AppError) {
      return ApiResponse.error(error.message, error.statusCode, error.errors);
    }
    console.error("[Payroll Execute Error]", error);
    return ApiResponse.error("Internal server error", 500);
  }
}
