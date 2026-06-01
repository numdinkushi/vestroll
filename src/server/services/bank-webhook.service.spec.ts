import crypto from "crypto";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { BankWebhookService } from "./bank-webhook.service";
import {
  BankAccountStatus,
  BankWebhookProvider,
} from "@/server/enums/bank-account.enum";

vi.mock("@/server/db", () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
  },
}));

import { db } from "@/server/db";

function mockSelectChain(result: unknown[]) {
  const limit = vi.fn().mockResolvedValue(result);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  vi.mocked(db.select).mockReturnValue({ from } as never);
  return { limit, where, from };
}

function mockUpdateChain() {
  const where = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn().mockReturnValue({ where });
  vi.mocked(db.update).mockReturnValue({ set } as never);
  return { set, where };
}

describe("BankWebhookService", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, PAYSTACK_WEBHOOK_SECRET: "paystack-secret" };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("updates bank account status from pending to verified", async () => {
    mockSelectChain([
      { id: "bank-account-1", status: BankAccountStatus.PENDING },
    ]);
    mockUpdateChain();

    const rawBody = JSON.stringify({
      event: "customeridentification.success",
      data: { customer_code: "CUS_abc123" },
    });

    const signature = crypto
      .createHmac("sha512", "paystack-secret")
      .update(rawBody)
      .digest("hex");

    const result = await BankWebhookService.processWebhook(
      BankWebhookProvider.PAYSTACK,
      rawBody,
      signature,
    );

    expect(result.statusUpdated).toBe(true);
    expect(result.status).toBe(BankAccountStatus.VERIFIED);
    expect(result.providerAccountId).toBe("CUS_abc123");
    expect(db.update).toHaveBeenCalled();
  });

  it("updates bank account status to disconnected on failure events", async () => {
    mockSelectChain([
      { id: "bank-account-1", status: BankAccountStatus.VERIFIED },
    ]);
    mockUpdateChain();

    const rawBody = JSON.stringify({
      event: "customeridentification.failed",
      data: { customer_code: "CUS_failed" },
    });

    const signature = crypto
      .createHmac("sha512", "paystack-secret")
      .update(rawBody)
      .digest("hex");

    const result = await BankWebhookService.processWebhook(
      BankWebhookProvider.PAYSTACK,
      rawBody,
      signature,
    );

    expect(result.statusUpdated).toBe(true);
    expect(result.status).toBe(BankAccountStatus.DISCONNECTED);
  });

  it("returns statusUpdated false for unhandled events", async () => {
    const rawBody = JSON.stringify({
      event: "charge.success",
      data: { reference: "ref_123" },
    });

    const signature = crypto
      .createHmac("sha512", "paystack-secret")
      .update(rawBody)
      .digest("hex");

    const result = await BankWebhookService.processWebhook(
      BankWebhookProvider.PAYSTACK,
      rawBody,
      signature,
    );

    expect(result.statusUpdated).toBe(false);
    expect(result.status).toBeNull();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("returns statusUpdated false when bank account is not found", async () => {
    mockSelectChain([]);

    const rawBody = JSON.stringify({
      event: "customeridentification.success",
      data: { customer_code: "CUS_missing" },
    });

    const signature = crypto
      .createHmac("sha512", "paystack-secret")
      .update(rawBody)
      .digest("hex");

    const result = await BankWebhookService.processWebhook(
      BankWebhookProvider.PAYSTACK,
      rawBody,
      signature,
    );

    expect(result.statusUpdated).toBe(false);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("skips update when status is unchanged", async () => {
    mockSelectChain([
      { id: "bank-account-1", status: BankAccountStatus.VERIFIED },
    ]);

    const rawBody = JSON.stringify({
      event: "customeridentification.success",
      data: { customer_code: "CUS_abc123" },
    });

    const signature = crypto
      .createHmac("sha512", "paystack-secret")
      .update(rawBody)
      .digest("hex");

    const result = await BankWebhookService.processWebhook(
      BankWebhookProvider.PAYSTACK,
      rawBody,
      signature,
    );

    expect(result.statusUpdated).toBe(false);
    expect(db.update).not.toHaveBeenCalled();
  });
});
