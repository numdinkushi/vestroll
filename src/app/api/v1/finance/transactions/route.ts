import { NextRequest } from "next/server";
import { ApiResponse } from "@/server/utils/api-response";
import { AppError } from "@/server/utils/errors";
import { AuthUtils } from "@/server/utils/auth";
import { TransactionService } from "@/server/services/transaction.service";
import { ListTransactionsSchema } from "@/server/validations/finance.schema";

/**
 * @swagger
 * /finance/transactions:
 *   get:
 *     summary: List finance transactions
 *     description: Retrieve the paginated history of all wallet movements for the organization, with support for asset filtering.
 *     tags: [Finance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *         description: Number of results per page
 *       - in: query
 *         name: asset
 *         schema:
 *           type: string
 *         description: Filter by asset symbol (e.g., USDC, USDT, XLM)
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [Pending, Failed, Successful]
 *         description: Filter by transaction status
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *         description: Filter by transaction type (e.g., payout, deposit, withdrawal)
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [date, status, type]
 *           default: date
 *         description: Field to sort results by
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort direction (ascending or descending)
 *     responses:
 *       200:
 *         description: Transactions retrieved successfully
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
 *                     data:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           type:
 *                             type: string
 *                           amount:
 *                             type: string
 *                           asset:
 *                             type: string
 *                           status:
 *                             type: string
 *                             enum: [Pending, Failed, Successful]
 *                           timestamp:
 *                             type: string
 *                             format: date-time
 *                           description:
 *                             type: string
 *                     meta:
 *                       type: object
 *                       properties:
 *                         page:
 *                           type: integer
 *                         limit:
 *                           type: integer
 *                         total:
 *                           type: integer
 *                         totalPages:
 *                           type: integer
 *       400:
 *         description: Invalid query parameters
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 */
export async function GET(req: NextRequest) {
  try {

    try {
      if (req.headers.get("Authorization")) {
        await AuthUtils.authenticateRequest(req);
      }
    } catch {
      return ApiResponse.error("Unauthorized", 401);
    }

    const { searchParams } = new URL(req.url);
    const rawParams = {
      page: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
      asset: searchParams.get("asset") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      type: searchParams.get("type") ?? undefined,
      sortBy: searchParams.get("sortBy") ?? undefined,
      order: searchParams.get("order") ?? undefined,
    };

    const parsed = ListTransactionsSchema.safeParse(rawParams);

    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      return ApiResponse.error("Invalid query parameters", 400, fieldErrors);
    }

    const result = await TransactionService.listTransactions(parsed.data);

    return ApiResponse.success(result, "Transactions retrieved successfully");
  } catch (error) {
    if (error instanceof AppError) {
      return ApiResponse.error(error.message, error.statusCode, error.errors);
    }

    console.error("[List Transactions Error]", error);
    return ApiResponse.error("Internal server error", 500);
  }
}
