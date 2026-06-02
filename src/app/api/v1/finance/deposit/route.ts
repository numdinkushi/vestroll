import { NextRequest } from "next/server";
import { ApiResponse } from "@/server/utils/api-response";
import { AuthUtils } from "@/server/utils/auth";
import { FiatDepositService } from "@/server/services/fiat-deposit.service";
import { ChargeDepositSchema } from "@/server/validations/finance.schema";
import { withHandler } from "@/server/utils/with-error-handler";

/**
 * @swagger
 * /finance/deposit:
 *   post:
 *     summary: Process a fiat wallet deposit via charge
 *     description: Charge a saved payment method to fund the organization's fiat wallet immediately.
 *     tags: [Finance]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *               - paymentMethodId
 *             properties:
 *               amount:
 *                 type: number
 *                 description: Deposit amount in NGN
 *               paymentMethodId:
 *                 type: string
 *                 description: The ID of the saved payment method to charge
 *               provider:
 *                 type: string
 *                 enum: [monnify, flutterwave]
 *                 description: Optional override for payment gateway provider
 *     responses:
 *       200:
 *         description: Deposit processed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     reference:
 *                       type: string
 *                     amount:
 *                       type: number
 *                     status:
 *                       type: string
 *                     providerReference:
 *                       type: string
 *       401:
 *         description: Unauthorized
 *       400:
 *         description: Bad request - Validation error
 */
export const POST = withHandler(
  { schema: ChargeDepositSchema },
  async (req: NextRequest, { body, metadata }) => {
    const { user } = await AuthUtils.authenticateRequestOrRefreshCookie(req);

    const result = await FiatDepositService.processCharge(user.id, body);

    return ApiResponse.success(result, "Deposit processed successfully.");
  }
);
