import { NextRequest } from "next/server";
import { z } from "zod";
import { ApiResponse } from "@/server/utils/api-response";
import { AppError } from "@/server/utils/errors";
import { AuthUtils } from "@/server/utils/auth";
import { ActivityService } from "@/server/services/activity.service";

const ActivityQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

/**
 * @swagger
 * /dashboard/activity:
 *   get:
 *     summary: List recent dashboard activity
 *     description: Retrieve a chronologically ordered, paginated activity feed combining transactions, payroll runs, and created invoices for the authenticated user's organization.
 *     tags: [General]
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
 *         description: Number of activity items per page
 *     responses:
 *       200:
 *         description: Recent activities retrieved successfully
 *       400:
 *         description: Invalid query parameters
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: User not associated with any organization
 */
export async function GET(req: NextRequest) {
  try {
    const { userId } = await AuthUtils.authenticateRequest(req);
    const { searchParams } = new URL(req.url);

    const parsed = ActivityQuerySchema.safeParse({
      page: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });

    if (!parsed.success) {
      return ApiResponse.error(
        "Invalid query parameters",
        400,
        parsed.error.flatten().fieldErrors,
      );
    }

    const activities = await ActivityService.listRecentActivities(
      userId,
      parsed.data.page,
      parsed.data.limit,
    );

    return ApiResponse.success(
      activities,
      "Recent activities retrieved successfully",
    );
  } catch (error) {
    if (error instanceof AppError) {
      return ApiResponse.error(error.message, error.statusCode, error.errors);
    }

    console.error("[Recent Activity Error]", error);
    return ApiResponse.error("Internal server error", 500);
  }
}
