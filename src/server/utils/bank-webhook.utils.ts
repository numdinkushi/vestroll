import { NextRequest } from "next/server";
import {
  BANK_WEBHOOK_PROVIDER_QUERY_PARAM,
  BANK_WEBHOOK_SIGNATURE_HEADERS,
} from "@/server/constants/bank-webhook.constants";
import { BankWebhookProvider } from "@/server/enums/bank-account.enum";
import { BadRequestError } from "@/server/utils/errors";

function isBankWebhookProvider(value: string): value is BankWebhookProvider {
  return Object.values(BankWebhookProvider).includes(value as BankWebhookProvider);
}

export function resolveBankWebhookProvider(
  req: NextRequest,
): BankWebhookProvider | null {
  for (const provider of Object.values(BankWebhookProvider)) {
    const headerName = BANK_WEBHOOK_SIGNATURE_HEADERS[provider];
    if (req.headers.get(headerName)) {
      return provider;
    }
  }

  const queryProvider = req.nextUrl.searchParams.get(
    BANK_WEBHOOK_PROVIDER_QUERY_PARAM,
  );

  if (queryProvider && isBankWebhookProvider(queryProvider)) {
    return queryProvider;
  }

  return null;
}

export function extractBankWebhookSignature(
  req: NextRequest,
  provider: BankWebhookProvider,
): string | null {
  return req.headers.get(BANK_WEBHOOK_SIGNATURE_HEADERS[provider]);
}

export function extractBankWebhookEventType(
  provider: BankWebhookProvider,
  payload: Record<string, unknown>,
): string | null {
  if (provider === BankWebhookProvider.PAYSTACK) {
    return typeof payload.event === "string" ? payload.event : null;
  }

  if (provider === BankWebhookProvider.STRIPE) {
    return typeof payload.type === "string" ? payload.type : null;
  }

  return null;
}

export function extractProviderAccountId(
  provider: BankWebhookProvider,
  payload: Record<string, unknown>,
): string | null {
  const data = payload.data;

  if (!data || typeof data !== "object") {
    return null;
  }

  const eventData = data as Record<string, unknown>;

  if (provider === BankWebhookProvider.PAYSTACK) {
    if (typeof eventData.customer_code === "string") {
      return eventData.customer_code;
    }

    const customer = eventData.customer;
    if (
      customer &&
      typeof customer === "object" &&
      typeof (customer as Record<string, unknown>).customer_code === "string"
    ) {
      return (customer as Record<string, string>).customer_code;
    }

    const dedicatedAccount = eventData.dedicated_account;
    if (dedicatedAccount && typeof dedicatedAccount === "object") {
      const accountId = (dedicatedAccount as Record<string, unknown>).id;
      if (accountId !== undefined && accountId !== null) {
        return String(accountId);
      }
    }

    const transfer = eventData.transfer;
    if (transfer && typeof transfer === "object") {
      const transferCode = (transfer as Record<string, unknown>).transfer_code;
      if (typeof transferCode === "string") {
        return transferCode;
      }
    }

    return null;
  }

  if (provider === BankWebhookProvider.STRIPE) {
    const object = eventData.object;
    if (object && typeof object === "object") {
      const accountId = (object as Record<string, unknown>).id;
      if (typeof accountId === "string") {
        return accountId;
      }
    }

    return null;
  }

  return null;
}

export function parseBankWebhookPayload(rawBody: string): Record<string, unknown> {
  try {
    const payload = JSON.parse(rawBody) as unknown;

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new BadRequestError("Invalid webhook payload");
    }

    return payload as Record<string, unknown>;
  } catch (error) {
    if (error instanceof BadRequestError) {
      throw error;
    }

    throw new BadRequestError("Invalid JSON in webhook payload");
  }
}
