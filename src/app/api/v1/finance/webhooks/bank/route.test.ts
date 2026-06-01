import crypto from "crypto";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import {
  BankAccountStatus,
  BankWebhookProvider,
} from "@/server/enums/bank-account.enum";
import type { BankWebhookProcessResult } from "@/server/services/bank-webhook.service";

vi.mock("@/server/services/bank-webhook.service", () => ({
  BankWebhookService: {
    processWebhook: vi.fn(),
  },
}));

import { BankWebhookService } from "@/server/services/bank-webhook.service";

function makeRequest(
  body: string,
  headers: Record<string, string> = {},
  query = "",
) {
  return new NextRequest(
    `http://localhost/api/v1/finance/webhooks/bank${query}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body,
    },
  );
}

describe("POST /api/v1/finance/webhooks/bank", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("processes a Paystack webhook with valid signature header", async () => {
    vi.mocked(BankWebhookService.processWebhook).mockResolvedValue({
      received: true,
      statusUpdated: true,
      eventType: "customeridentification.success",
      providerAccountId: "CUS_abc123",
      status: BankAccountStatus.VERIFIED,
    } satisfies BankWebhookProcessResult);

    const body = JSON.stringify({
      event: "customeridentification.success",
      data: { customer_code: "CUS_abc123" },
    });

    const res = await POST(
      makeRequest(body, { "x-paystack-signature": "valid-signature" }),
    );

    expect(res.status).toBe(200);
    expect(BankWebhookService.processWebhook).toHaveBeenCalledWith(
      BankWebhookProvider.PAYSTACK,
      body,
      "valid-signature",
    );

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.statusUpdated).toBe(true);
  });

  it("processes a Stripe webhook with valid signature header", async () => {
    vi.mocked(BankWebhookService.processWebhook).mockResolvedValue({
      received: true,
      statusUpdated: true,
      eventType: "financial_connections.account.created",
      providerAccountId: "fca_abc123",
      status: BankAccountStatus.VERIFIED,
    } satisfies BankWebhookProcessResult);

    const body = JSON.stringify({
      type: "financial_connections.account.created",
      data: { object: { id: "fca_abc123" } },
    });

    const res = await POST(
      makeRequest(body, { "stripe-signature": "t=123,v1=abc" }),
    );

    expect(res.status).toBe(200);
    expect(BankWebhookService.processWebhook).toHaveBeenCalledWith(
      BankWebhookProvider.STRIPE,
      body,
      "t=123,v1=abc",
    );
  });

  it("resolves provider from query param when signature header is absent", async () => {
    vi.mocked(BankWebhookService.processWebhook).mockResolvedValue({
      received: true,
      statusUpdated: false,
      eventType: null,
      providerAccountId: null,
      status: null,
    });

    const body = JSON.stringify({ event: "unknown.event", data: {} });

    const res = await POST(
      makeRequest(body, { "x-paystack-signature": "sig" }, "?provider=paystack"),
    );

    expect(res.status).toBe(200);
    expect(BankWebhookService.processWebhook).toHaveBeenCalledWith(
      BankWebhookProvider.PAYSTACK,
      body,
      "sig",
    );
  });

  it("returns 400 when provider cannot be determined", async () => {
    const res = await POST(makeRequest(JSON.stringify({ event: "test" })));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.message).toContain("Unable to determine webhook provider");
  });

  it("returns 401 when signature header is missing", async () => {
    const res = await POST(
      makeRequest(JSON.stringify({ event: "test" }), {}, "?provider=paystack"),
    );

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.message).toContain("Missing webhook signature");
  });

  it("returns 401 when signature verification fails", async () => {
    const { UnauthorizedError } = await import("@/server/utils/errors");
    vi.mocked(BankWebhookService.processWebhook).mockRejectedValue(
      new UnauthorizedError("Invalid Paystack webhook signature"),
    );

    const res = await POST(
      makeRequest(JSON.stringify({ event: "test" }), {
        "x-paystack-signature": "invalid",
      }),
    );

    expect(res.status).toBe(401);
  });

  it("returns 500 for unexpected errors", async () => {
    vi.mocked(BankWebhookService.processWebhook).mockRejectedValue(
      new Error("Unexpected failure"),
    );

    const res = await POST(
      makeRequest(JSON.stringify({ event: "test" }), {
        "x-paystack-signature": "sig",
      }),
    );

    expect(res.status).toBe(500);
  });
});

describe("BankWebhookSignatureUtils", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("verifies Paystack signatures using the webhook secret", async () => {
    const { BankWebhookSignatureUtils } = await import(
      "@/server/utils/bank-webhook-signature.utils"
    );

    const secret = "paystack-test-secret";
    process.env.PAYSTACK_WEBHOOK_SECRET = secret;

    const rawBody = JSON.stringify({
      event: "customeridentification.success",
      data: { customer_code: "CUS_abc123" },
    });

    const signature = crypto
      .createHmac("sha512", secret)
      .update(rawBody)
      .digest("hex");

    expect(() =>
      BankWebhookSignatureUtils.verify(
        BankWebhookProvider.PAYSTACK,
        rawBody,
        signature,
      ),
    ).not.toThrow();
  });

  it("rejects invalid Paystack signatures", async () => {
    const { BankWebhookSignatureUtils } = await import(
      "@/server/utils/bank-webhook-signature.utils"
    );
    const { UnauthorizedError } = await import("@/server/utils/errors");

    process.env.PAYSTACK_WEBHOOK_SECRET = "paystack-test-secret";

    expect(() =>
      BankWebhookSignatureUtils.verify(
        BankWebhookProvider.PAYSTACK,
        "{}",
        "invalid-signature",
      ),
    ).toThrow(UnauthorizedError);
  });

  it("verifies Stripe signatures within tolerance window", async () => {
    const { BankWebhookSignatureUtils } = await import(
      "@/server/utils/bank-webhook-signature.utils"
    );

    const secret = "whsec_test_secret";
    process.env.STRIPE_WEBHOOK_SECRET = secret;

    const rawBody = JSON.stringify({
      type: "financial_connections.account.created",
      data: { object: { id: "fca_abc123" } },
    });

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signedPayload = `${timestamp}.${rawBody}`;
    const signature = crypto
      .createHmac("sha256", secret)
      .update(signedPayload)
      .digest("hex");

    expect(() =>
      BankWebhookSignatureUtils.verify(
        BankWebhookProvider.STRIPE,
        rawBody,
        `t=${timestamp},v1=${signature}`,
      ),
    ).not.toThrow();
  });
});

describe("bank webhook utils", () => {
  it("extracts Paystack event metadata from payload", async () => {
    const {
      extractBankWebhookEventType,
      extractProviderAccountId,
    } = await import("@/server/utils/bank-webhook.utils");

    const payload = {
      event: "dedicatedaccount.assign.success",
      data: {
        customer: { customer_code: "CUS_xyz789" },
        dedicated_account: { id: 42 },
      },
    };

    expect(
      extractBankWebhookEventType(BankWebhookProvider.PAYSTACK, payload),
    ).toBe("dedicatedaccount.assign.success");
    expect(
      extractProviderAccountId(BankWebhookProvider.PAYSTACK, payload),
    ).toBe("CUS_xyz789");
  });

  it("extracts Stripe event metadata from payload", async () => {
    const {
      extractBankWebhookEventType,
      extractProviderAccountId,
    } = await import("@/server/utils/bank-webhook.utils");

    const payload = {
      type: "financial_connections.account.deactivated",
      data: { object: { id: "fca_deactivated" } },
    };

    expect(
      extractBankWebhookEventType(BankWebhookProvider.STRIPE, payload),
    ).toBe("financial_connections.account.deactivated");
    expect(
      extractProviderAccountId(BankWebhookProvider.STRIPE, payload),
    ).toBe("fca_deactivated");
  });
});
