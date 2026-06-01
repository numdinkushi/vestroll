import { eq } from "drizzle-orm";
import { BANK_WEBHOOK_EVENT_STATUS_MAP } from "@/server/constants/bank-webhook.constants";
import { db } from "@/server/db";
import { bankAccounts } from "@/server/db/schema";
import {
  BankAccountStatus,
  BankWebhookProvider,
} from "@/server/enums/bank-account.enum";
import { Logger } from "@/server/services/logger.service";
import { BankWebhookSignatureUtils } from "@/server/utils/bank-webhook-signature.utils";
import {
  extractBankWebhookEventType,
  extractProviderAccountId,
  parseBankWebhookPayload,
} from "@/server/utils/bank-webhook.utils";

export interface BankWebhookProcessResult {
  received: true;
  statusUpdated: boolean;
  eventType: string | null;
  providerAccountId: string | null;
  status: BankAccountStatus | null;
}

export class BankWebhookService {
  static async processWebhook(
    provider: BankWebhookProvider,
    rawBody: string,
    signature: string,
  ): Promise<BankWebhookProcessResult> {
    BankWebhookSignatureUtils.verify(provider, rawBody, signature);

    const payload = parseBankWebhookPayload(rawBody);
    const eventType = extractBankWebhookEventType(provider, payload);
    const providerAccountId = extractProviderAccountId(provider, payload);
    const targetStatus = eventType
      ? BANK_WEBHOOK_EVENT_STATUS_MAP[provider][eventType]
      : undefined;

    Logger.info("Bank webhook received", {
      provider,
      eventType,
      providerAccountId,
    });

    if (!eventType || !providerAccountId || !targetStatus) {
      return {
        received: true,
        statusUpdated: false,
        eventType,
        providerAccountId,
        status: null,
      };
    }

    const statusUpdated = await this.updateBankAccountStatus(
      provider,
      providerAccountId,
      targetStatus,
    );

    return {
      received: true,
      statusUpdated,
      eventType,
      providerAccountId,
      status: targetStatus,
    };
  }

  static async updateBankAccountStatus(
    provider: BankWebhookProvider,
    providerAccountId: string,
    status: BankAccountStatus,
  ): Promise<boolean> {
    const [account] = await db
      .select({ id: bankAccounts.id, status: bankAccounts.status })
      .from(bankAccounts)
      .where(eq(bankAccounts.providerAccountId, providerAccountId))
      .limit(1);

    if (!account) {
      Logger.warn("Bank account not found for webhook update", {
        provider,
        providerAccountId,
        status,
      });
      return false;
    }

    if (account.status === status) {
      return false;
    }

    const timestamp = new Date();

    await db
      .update(bankAccounts)
      .set({
        status,
        provider,
        verifiedAt:
          status === BankAccountStatus.VERIFIED ? timestamp : undefined,
        disconnectedAt:
          status === BankAccountStatus.DISCONNECTED ? timestamp : undefined,
        updatedAt: timestamp,
      })
      .where(eq(bankAccounts.id, account.id));

    Logger.info("Bank account status updated", {
      bankAccountId: account.id,
      provider,
      providerAccountId,
      status,
    });

    return true;
  }
}
