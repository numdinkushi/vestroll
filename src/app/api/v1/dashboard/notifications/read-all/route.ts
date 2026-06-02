import { NextRequest } from "next/server";
import { ApiResponse } from "@/server/utils/api-response";
import { AppError } from "@/server/utils/errors";
import { AuthUtils } from "@/server/utils/auth";
import { markAllUnreadAsRead } from "@/server/services/notification.service";

/**
 * @swagger
 * /dashboard/notifications/read-all:
 * patch:
 * summary: Mark all notifications as read
 * description: Marks all unread notifications as read for the authenticated user
 * tags: [Notifications]
 * security:
 * - bearerAuth: []
 * responses:
 * 200:
 * description: Notifications marked as read successfully
 * content:
 * application/json:
 * schema:
 * type: object
 * properties:
 * success:
 * type: boolean
 * message:
 * type: string
 * count:
 * type: number
 * 401:
 * description: Unauthorized
 * 500:
 * description: Internal server error
 */
export async function PATCH(req: NextRequest) {
  try {
    const { userId } = await AuthUtils.authenticateRequest(req);
    
    const updatedCount = await markAllUnreadAsRead(userId);

    return ApiResponse.success(
      { count: updatedCount },
      "Notifications marked as read"
    );
  } catch (error) {
    if (error instanceof AppError) {
      return ApiResponse.error(error.message, error.statusCode, error.errors);
    }

    console.error("[Notifications Read All Error]", error);
    return ApiResponse.error("Internal server error", 500);
  }
}