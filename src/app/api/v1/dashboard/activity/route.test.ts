import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { AuthUtils } from "@/server/utils/auth";
import { ActivityService } from "@/server/services/activity.service";
import { UnauthorizedError, ForbiddenError } from "@/server/utils/errors";

vi.mock("@/server/utils/auth");
vi.mock("@/server/services/activity.service");

describe("GET /api/v1/dashboard/activity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createMockRequest = (url = "http://localhost/api/v1/dashboard/activity") =>
    new NextRequest(url);

  it("should retrieve paginated recent activity with default pagination", async () => {
    vi.mocked(AuthUtils.authenticateRequest).mockResolvedValue({
      userId: "user-123",
    } as any);
    vi.mocked(ActivityService.listRecentActivities).mockResolvedValue({
      data: [
        {
          id: "transaction:tx-001",
          sourceId: "tx-001",
          type: "transaction",
          title: "Deposit transaction",
          description: "Deposit via monnify",
          amount: "250000",
          status: "completed",
          timestamp: "2026-05-28T00:00:00.000Z",
          metadata: { provider: "monnify" },
        },
      ],
      meta: {
        page: 1,
        limit: 10,
        total: 1,
        totalPages: 1,
      },
    });

    const response = await GET(createMockRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toBe("Recent activities retrieved successfully");
    expect(body.data.data).toHaveLength(1);
    expect(body.data.meta.total).toBe(1);
    expect(ActivityService.listRecentActivities).toHaveBeenCalledWith(
      "user-123",
      1,
      10,
    );
  });

  it("should pass explicit page and limit query parameters to the service", async () => {
    vi.mocked(AuthUtils.authenticateRequest).mockResolvedValue({
      userId: "user-123",
    } as any);
    vi.mocked(ActivityService.listRecentActivities).mockResolvedValue({
      data: [],
      meta: {
        page: 2,
        limit: 5,
        total: 0,
        totalPages: 0,
      },
    });

    await GET(createMockRequest("http://localhost/api/v1/dashboard/activity?page=2&limit=5"));

    expect(ActivityService.listRecentActivities).toHaveBeenCalledWith(
      "user-123",
      2,
      5,
    );
  });

  it("should return 400 for invalid pagination query parameters", async () => {
    vi.mocked(AuthUtils.authenticateRequest).mockResolvedValue({
      userId: "user-123",
    } as any);

    const response = await GET(
      createMockRequest("http://localhost/api/v1/dashboard/activity?page=0&limit=101"),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.message).toBe("Invalid query parameters");
    expect(ActivityService.listRecentActivities).not.toHaveBeenCalled();
  });

  it("should return 401 for unauthorized access", async () => {
    vi.mocked(AuthUtils.authenticateRequest).mockRejectedValue(
      new UnauthorizedError(),
    );

    const response = await GET(createMockRequest());

    expect(response.status).toBe(401);
  });

  it("should return 403 when the user has no organization", async () => {
    vi.mocked(AuthUtils.authenticateRequest).mockResolvedValue({
      userId: "user-123",
    } as any);
    vi.mocked(ActivityService.listRecentActivities).mockRejectedValue(
      new ForbiddenError("User is not associated with any organization"),
    );

    const response = await GET(createMockRequest());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.message).toBe("User is not associated with any organization");
  });
});
