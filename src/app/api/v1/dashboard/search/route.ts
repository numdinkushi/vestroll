import { NextRequest } from "next/server";
import { ApiResponse } from "@/server/utils/api-response";
import { AppError, BadRequestError } from "@/server/utils/errors";
import { AuthUtils } from "@/server/utils/auth";
import { SearchService } from "@/server/services/search.service";

export async function GET(req: NextRequest) {
  try {
    const { user } = await AuthUtils.authenticateRequest(req);
    const query = req.nextUrl.searchParams.get("q")?.trim() ?? "";

    if (!query) {
      throw new BadRequestError("Query parameter 'q' is required");
    }

    if (!user.organizationId) {
      return ApiResponse.success(
        {
          employees: [],
          invoices: [],
          transactions: [],
        },
        "Global search results retrieved successfully",
      );
    }

    const result = await SearchService.globalSearch(user.organizationId, query);

    return ApiResponse.success(
      result,
      "Global search results retrieved successfully",
    );
  } catch (error) {
    if (error instanceof AppError) {
      return ApiResponse.error(error.message, error.status, error.errors);
    }

    console.error("[Global Search Error]", error);
    return ApiResponse.error("Internal server error", 500);
  }
}
