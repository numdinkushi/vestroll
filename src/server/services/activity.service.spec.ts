import { describe, it, expect, beforeEach, vi } from "vitest";
import { ActivityService } from "./activity.service";
import { db } from "@/server/db";
import { ForbiddenError } from "@/server/utils/errors";

vi.mock("@/server/db", () => ({
  db: {
    select: vi.fn(),
    execute: vi.fn(),
  },
  users: {
    id: "users.id",
    organizationId: "users.organizationId",
  },
}));

function mockOrganizationLookup(organizationId: string | null) {
  vi.mocked(db.select).mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([{ organizationId }]),
      }),
    }),
  } as any);
}

describe("ActivityService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return a unified paginated activity feed", async () => {
    mockOrganizationLookup("org-123");
    vi.mocked(db.execute)
      .mockResolvedValueOnce({
        rows: [
          {
            id: "transaction:tx-001",
            sourceId: "tx-001",
            type: "transaction",
            title: "Deposit transaction",
            description: "Deposit via monnify",
            amount: "100000",
            status: "completed",
            timestamp: new Date("2026-05-28T10:00:00.000Z"),
            metadata: { provider: "monnify" },
          },
          {
            id: "invoice_created:inv-001",
            sourceId: "inv-001",
            type: "invoice_created",
            title: "Invoice created",
            description: "Invoice INV-001 created: May payroll",
            amount: "500000",
            status: "pending",
            timestamp: "2026-05-27T10:00:00.000Z",
            metadata: { invoiceNo: "INV-001" },
          },
        ],
      } as never)
      .mockResolvedValueOnce({
        rows: [{ total: "12" }],
      } as never);

    const result = await ActivityService.listRecentActivities("user-123", 2, 5);

    expect(result.meta).toEqual({
      page: 2,
      limit: 5,
      total: 12,
      totalPages: 3,
    });
    expect(result.data).toHaveLength(2);
    expect(result.data[0].timestamp).toBe("2026-05-28T10:00:00.000Z");
    expect(result.data[1].type).toBe("invoice_created");
    expect(db.execute).toHaveBeenCalledTimes(2);
  });

  it("should throw when the user is not associated with an organization", async () => {
    mockOrganizationLookup(null);

    await expect(
      ActivityService.listRecentActivities("user-123", 1, 10),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(db.execute).not.toHaveBeenCalled();
  });
});
