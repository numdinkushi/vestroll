import { NextRequest } from "next/server";
import { ApiResponse } from "@/server/utils/api-response";
import { AppError } from "@/server/utils/errors";
import { BankWebhookService } from "@/server/services/bank-webhook.service";
import { Logger } from "@/server/services/logger.service";
import {
  extractBankWebhookSignature,
  resolveBankWebhookProvider,
} from "@/server/utils/bank-webhook.utils";

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const provider = resolveBankWebhookProvider(req);

    if (!provider) {
      return ApiResponse.error(
        "Unable to determine webhook provider",
        400,
        null,
        req,
      );
    }

    const signature = extractBankWebhookSignature(req, provider);

    if (!signature) {
      return ApiResponse.error("Missing webhook signature", 401, null, req);
    }

    const result = await BankWebhookService.processWebhook(
      provider,
      rawBody,
      signature,
    );

    return ApiResponse.success(result, "Webhook processed successfully");
  } catch (error) {
    if (error instanceof AppError) {
      return ApiResponse.error(
        error.message,
        error.statusCode,
        error.errors,
        req,
      );
    }

    Logger.error("[Bank Webhook Error]", { error: String(error) });
    return ApiResponse.error("Webhook processing failed", 500, null, req);
  }
}
