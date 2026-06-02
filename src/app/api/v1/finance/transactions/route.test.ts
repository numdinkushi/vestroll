import { describe, it, expect } from "vitest";
import { GET } from "./route";
import { NextRequest } from "next/server";

function makeRequest(query = "") {
  return new NextRequest(
    `http://localhost:3000/api/v1/finance/transactions${query}`,
  );
}

describe("GET /api/v1/finance/transactions", () => {
  it("returns all transactions sorted by date desc by default", async () => {
    const response = await GET(makeRequest());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);

    const items = body.data.data as Array<{ timestamp: string }>;
    expect(items.length).toBeGreaterThan(0);
    for (let i = 1; i < items.length; i++) {
      expect(new Date(items[i - 1].timestamp).getTime()).toBeGreaterThanOrEqual(
        new Date(items[i].timestamp).getTime(),
      );
    }
  });

  it("filters by status", async () => {
    const response = await GET(makeRequest("?status=Failed&limit=100"));

    expect(response.status).toBe(200);
    const body = await response.json();
    const items = body.data.data as Array<{ status: string }>;
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((tx) => tx.status === "Failed")).toBe(true);
  });

  it("filters by type (case-insensitive)", async () => {
    const response = await GET(makeRequest("?type=DEPOSIT&limit=100"));

    expect(response.status).toBe(200);
    const body = await response.json();
    const items = body.data.data as Array<{ type: string }>;
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((tx) => tx.type === "deposit")).toBe(true);
  });

  it("combines status and type filters", async () => {
    const response = await GET(
      makeRequest("?status=Successful&type=payout&limit=100"),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    const items = body.data.data as Array<{ status: string; type: string }>;
    expect(items.length).toBeGreaterThan(0);
    expect(
      items.every((tx) => tx.status === "Successful" && tx.type === "payout"),
    ).toBe(true);
  });

  it("sorts by date ascending when order=asc", async () => {
    const response = await GET(
      makeRequest("?sortBy=date&order=asc&limit=100"),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    const items = body.data.data as Array<{ timestamp: string }>;
    for (let i = 1; i < items.length; i++) {
      expect(new Date(items[i - 1].timestamp).getTime()).toBeLessThanOrEqual(
        new Date(items[i].timestamp).getTime(),
      );
    }
  });

  it("sorts by status ascending", async () => {
    const response = await GET(
      makeRequest("?sortBy=status&order=asc&limit=100"),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    const items = body.data.data as Array<{ status: string }>;
    const statuses = items.map((tx) => tx.status);
    const sorted = [...statuses].sort((a, b) => a.localeCompare(b));
    expect(statuses).toEqual(sorted);
  });

  it("sorts by type descending", async () => {
    const response = await GET(
      makeRequest("?sortBy=type&order=desc&limit=100"),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    const items = body.data.data as Array<{ type: string }>;
    const types = items.map((tx) => tx.type ?? "");
    const sorted = [...types].sort((a, b) => b.localeCompare(a));
    expect(types).toEqual(sorted);
  });

  it("rejects an invalid sortBy value with 400", async () => {
    const response = await GET(makeRequest("?sortBy=amount"));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  it("rejects an invalid order value with 400", async () => {
    const response = await GET(makeRequest("?order=sideways"));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
  });
});
