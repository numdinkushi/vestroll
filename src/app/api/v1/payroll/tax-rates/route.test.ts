import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

describe("GET /api/v1/payroll/tax-rates", () => {
  it("returns federal tax rate and full state rate dictionary by default", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/v1/payroll/tax-rates"),
    );

    expect(response.status).toBe(200);
    const payload = await response.json();

    expect(payload.success).toBe(true);
    expect(payload.message).toBe("Payroll tax rates retrieved successfully");
    expect(payload.data.federal).toBe(22);
    expect(payload.data.stateRates.CA).toBe(9.3);
    expect(payload.data.selectedState).toBeUndefined();
  });

  it("returns a selected state tax rate when state query param is provided", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/v1/payroll/tax-rates?state=CA"),
    );

    expect(response.status).toBe(200);
    const payload = await response.json();

    expect(payload.success).toBe(true);
    expect(payload.data.selectedState).toEqual({
      code: "CA",
      incomeTaxRate: 9.3,
    });
    expect(payload.data.stateRates.CA).toBe(9.3);
  });

  it("returns 400 when an unsupported state code is requested", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/v1/payroll/tax-rates?state=XX"),
    );

    expect(response.status).toBe(400);
    const payload = await response.json();

    expect(payload.success).toBe(false);
    expect(payload.message).toContain("Tax rates are not available for state code");
  });
});
