import {
  BankAccountStatus,
  BankWebhookProvider,
} from "@/server/enums/bank-account.enum";

export const BANK_WEBHOOK_SIGNATURE_HEADERS: Record<
  BankWebhookProvider,
  string
> = {
  [BankWebhookProvider.PAYSTACK]: "x-paystack-signature",
  [BankWebhookProvider.STRIPE]: "stripe-signature",
};

export const BANK_WEBHOOK_PROVIDER_QUERY_PARAM = "provider";

export const BANK_WEBHOOK_EVENT_STATUS_MAP: Record<
  BankWebhookProvider,
  Record<string, BankAccountStatus>
> = {
  [BankWebhookProvider.PAYSTACK]: {
    "customeridentification.success": BankAccountStatus.VERIFIED,
    "customeridentification.failed": BankAccountStatus.DISCONNECTED,
    "dedicatedaccount.assign.success": BankAccountStatus.VERIFIED,
    "dedicatedaccount.assign.failed": BankAccountStatus.DISCONNECTED,
    "transfer.success": BankAccountStatus.VERIFIED,
    "transfer.failed": BankAccountStatus.DISCONNECTED,
    "transfer.reversed": BankAccountStatus.DISCONNECTED,
  },
  [BankWebhookProvider.STRIPE]: {
    "financial_connections.account.created": BankAccountStatus.VERIFIED,
    "financial_connections.account.refreshed_balance": BankAccountStatus.VERIFIED,
    "financial_connections.account.deactivated": BankAccountStatus.DISCONNECTED,
    "financial_connections.account.disconnected": BankAccountStatus.DISCONNECTED,
    "account.application.deauthorized": BankAccountStatus.DISCONNECTED,
  },
};

export const STRIPE_WEBHOOK_TOLERANCE_SECONDS = 300;

export const BANK_WEBHOOK_SECRET_ENV_KEYS: Record<
  BankWebhookProvider,
  string[]
> = {
  [BankWebhookProvider.PAYSTACK]: [
    "PAYSTACK_WEBHOOK_SECRET",
    "PAYSTACK_SECRET_KEY",
  ],
  [BankWebhookProvider.STRIPE]: ["STRIPE_WEBHOOK_SECRET"],
};
