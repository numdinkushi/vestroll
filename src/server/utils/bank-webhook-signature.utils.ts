import crypto from "crypto";
import {
  BANK_WEBHOOK_SECRET_ENV_KEYS,
  STRIPE_WEBHOOK_TOLERANCE_SECONDS,
} from "@/server/constants/bank-webhook.constants";
import { BankWebhookProvider } from "@/server/enums/bank-account.enum";
import { UnauthorizedError } from "@/server/utils/errors";

function resolveSecret(provider: BankWebhookProvider): string {
  const envKeys = BANK_WEBHOOK_SECRET_ENV_KEYS[provider];

  for (const key of envKeys) {
    const value = process.env[key];
    if (value) {
      return value;
    }
  }

  throw new UnauthorizedError(`Missing webhook secret for provider: ${provider}`);
}

function safeCompare(expected: string, received: string): boolean {
  if (expected.length !== received.length) {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(expected, "utf8"),
    Buffer.from(received, "utf8"),
  );
}

function verifyPaystackSignature(rawBody: string, signature: string): void {
  const secret = resolveSecret(BankWebhookProvider.PAYSTACK);
  const hash = crypto
    .createHmac("sha512", secret)
    .update(rawBody)
    .digest("hex");

  if (!safeCompare(hash, signature)) {
    throw new UnauthorizedError("Invalid Paystack webhook signature");
  }
}

function verifyStripeSignature(rawBody: string, signatureHeader: string): void {
  const secret = resolveSecret(BankWebhookProvider.STRIPE);
  const elements = signatureHeader.split(",");

  const timestamp = elements
    .find((element) => element.startsWith("t="))
    ?.slice(2);
  const signatures = elements
    .filter((element) => element.startsWith("v1="))
    .map((element) => element.slice(3));

  if (!timestamp || signatures.length === 0) {
    throw new UnauthorizedError("Invalid Stripe webhook signature format");
  }

  const eventAge = Math.floor(Date.now() / 1000) - Number(timestamp);
  if (
    Number.isNaN(eventAge) ||
    eventAge > STRIPE_WEBHOOK_TOLERANCE_SECONDS
  ) {
    throw new UnauthorizedError("Stripe webhook timestamp outside tolerance");
  }

  const signedPayload = `${timestamp}.${rawBody}`;
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(signedPayload)
    .digest("hex");

  const isValid = signatures.some((signature) =>
    safeCompare(expectedSignature, signature),
  );

  if (!isValid) {
    throw new UnauthorizedError("Invalid Stripe webhook signature");
  }
}

export class BankWebhookSignatureUtils {
  static verify(
    provider: BankWebhookProvider,
    rawBody: string,
    signature: string,
  ): void {
    switch (provider) {
      case BankWebhookProvider.PAYSTACK:
        verifyPaystackSignature(rawBody, signature);
        return;
      case BankWebhookProvider.STRIPE:
        verifyStripeSignature(rawBody, signature);
        return;
      default:
        throw new UnauthorizedError(`Unsupported webhook provider: ${provider}`);
    }
  }
}
