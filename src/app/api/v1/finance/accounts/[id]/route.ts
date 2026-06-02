import { NextRequest, NextResponse } from "next/server";
import { ApiResponse } from "@/server/utils/api-response";
import { AppError } from "@/server/utils/errors";
import { AuthUtils } from "@/server/utils/auth";
import { bankAccountService } from "@/server/services/bank-account.service";
import { db, employees } from "@/server/db";
import { eq } from "drizzle-orm";

/**
 * @swagger
 * /finance/accounts/{id}:
 *   delete:
 *     summary: Unlink connected bank account
 *     description: Safely unlink a connected fiat bank account from an employee's profile.
 *     tags: [Finance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Employee ID
 *     responses:
 *       200:
 *         description: Bank account unlinked successfully
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       403:
 *         description: Forbidden - User does not have permission to unlink this account
 *       404:
 *         description: Employee or bank account not found
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await AuthUtils.authenticateRequest(req);

    if (!user.organizationId) {
      throw new AppError("User not associated with an organization", 403);
    }

    const { id } = await params;

    // Verify ownership: Ensure the employee belongs to the user's organization
    const [employee] = await db
      .select({
        id: employees.id,
        organizationId: employees.organizationId,
      })
      .from(employees)
      .where(eq(employees.id, id))
      .limit(1);

    if (!employee) {
      throw new AppError("Employee not found", 404);
    }

    if (employee.organizationId !== user.organizationId) {
      throw new AppError("Forbidden: You do not have permission to unlink this account", 403);
    }

    await bankAccountService.unlinkBankAccount(id);

    return ApiResponse.success(
      { message: "Bank account unlinked successfully" },
      "Bank account unlinked successfully"
    );
  } catch (error) {
    if (error instanceof AppError) {
      return ApiResponse.error(error.message, error.statusCode, error.errors);
    }
    console.error("[Unlink Bank Account Error]", error);
    return ApiResponse.error("Internal server error", 500);
  }
}
