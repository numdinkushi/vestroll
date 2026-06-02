import { Logger } from "@/server/services/logger.service";
import {
  AppError,
  BadRequestError,
  InternalServerError,
  UnauthorizedError,
} from "@/server/utils/errors";
import type {
  PaymentProvider,
  DisburseParams,
  DisburseResult,
  VerifyTransactionResult,
  VirtualAccountRequest,
  VirtualAccountResult,
  InitializePaymentParams,
  InitializePaymentResult,
  ChargeParams,
  ChargeResult,
} from "./payment-provider.interface";

export interface MonnifyConfig {
  apiKey: string;
  secretKey: string;
  baseUrl: string;
  contractCode: string;
}

interface MonnifyAuthResponse {
  requestSuccessful: boolean;
  responseBody: {
    accessToken: string;
    expiresIn: number;
  };
}

interface MonnifyVirtualAccountResponse {
  requestSuccessful: boolean;
  responseMessage?: string;
  responseBody: {
    accounts: Array<{
      accountNumber: string;
      accountName: string;
      bankName: string;
      bankCode: string;
    }>;
    accountReference: string;
  };
}

interface MonnifyDisburseResponse {
  requestSuccessful: boolean;
  responseMessage?: string;
  responseBody: {
    amount: number;
    reference: string;
    transactionReference: string;
    status: string;
    totalFee: number;
  };
}

interface MonnifyVerifyTransactionResponse {
  requestSuccessful: boolean;
  responseMessage?: string;
  responseBody: {
    amountPaid?: number;
    amount?: number;
    paymentReference?: string;
    transactionReference?: string;
    paymentStatus?: string;
    status?: string;
    paidOn?: string;
    completedOn?: string;
    currencyCode?: "NGN";
  };
}

interface MonnifyInitializePaymentResponse {
  requestSuccessful: boolean;
  responseMessage?: string;
  responseBody: {
    checkoutUrl?: string;
    paymentReference?: string;
    transactionReference?: string;
    amount?: number;
    currencyCode?: string;
  };
}

interface MonnifyChargeResponse {
  requestSuccessful: boolean;
  responseMessage?: string;
  responseBody: {
    transactionReference: string;
    status: string;
    amount: number;
    totalFee: number;
  };
}

const MONNIFY_STATUS_MAP: Record<string, DisburseResult["status"]> = {
  SUCCESS: "completed",
  PENDING: "pending",
  FAILED: "failed",
  PENDING_AUTHORIZATION: "pending",
};

export class MonnifyProvider implements PaymentProvider {
  private accessToken: string | null = null;
  private tokenExpiresAt = 0;
  private readonly config: MonnifyConfig;

  constructor(config: MonnifyConfig) {
    this.config = config;
  }

  private async authenticate(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return this.accessToken;
    }

    const credentials = btoa(
      `${this.config.apiKey}:${this.config.secretKey}`
    );

    const response = await fetch(
      `${this.config.baseUrl}/api/v1/auth/login`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/json",
        },
      }
    );

    const data: MonnifyAuthResponse = await response.json();

    if (!response.ok || !data.requestSuccessful) {
      Logger.error("Monnify authentication failed", {
        status: response.status,
      });
      throw new UnauthorizedError("Monnify authentication failed");
    }

    this.accessToken = data.responseBody.accessToken;

    this.tokenExpiresAt =
      Date.now() + (data.responseBody.expiresIn - 60) * 1000;

    return this.accessToken;
  }

  async disburse(request: DisburseParams): Promise<DisburseResult> {
    const token = await this.authenticate();

    const response = await fetch(
      `${this.config.baseUrl}/api/v1/disbursements/single`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: request.amount,
          reference: request.reference,
          narration: request.narration,
          destinationBankCode: request.destinationBankCode,
          destinationAccountNumber: request.destinationAccountNumber,
          destinationAccountName: request.destinationAccountName,
          currency: request.currency,
          sourceAccountNumber: "",
        }),
      }
    );

    const data: MonnifyDisburseResponse = await response.json();

    if (!response.ok || !data.requestSuccessful) {
      Logger.error("Monnify disbursement failed", {
        reference: request.reference,
        responseMessage: data.responseMessage,
      });
      throw MonnifyProvider.mapError(response.status, data.responseMessage);
    }

    const body = data.responseBody;
    return {
      reference: body.reference,
      providerReference: body.transactionReference,
      status: MONNIFY_STATUS_MAP[body.status] ?? "pending",
      amount: body.amount,
      fee: body.totalFee,
    };
  }

  async generateVirtualAccount(orgId: string): Promise<VirtualAccountResult>;
  async generateVirtualAccount(
    request: VirtualAccountRequest
  ): Promise<VirtualAccountResult>;
  async generateVirtualAccount(
    orgIdOrRequest: string | VirtualAccountRequest
  ): Promise<VirtualAccountResult> {
    const request =
      typeof orgIdOrRequest === "string"
        ? MonnifyProvider.buildVirtualAccountRequest(orgIdOrRequest)
        : orgIdOrRequest;
    const token = await this.authenticate();

    const response = await fetch(
      `${this.config.baseUrl}/api/v1/bank-transfer/reserved-accounts`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          accountReference: request.reference,
          accountName: request.accountName,
          currencyCode: request.currency,
          contractCode: this.config.contractCode,
          customerEmail: request.customerEmail,
          customerName: request.customerName,
        }),
      }
    );

    const data: MonnifyVirtualAccountResponse = await response.json();

    if (!response.ok || !data.requestSuccessful) {
      Logger.error("Monnify virtual account creation failed", {
        reference: request.reference,
        responseMessage: data.responseMessage,
      });
      throw MonnifyProvider.mapError(response.status, data.responseMessage);
    }

    const account = data.responseBody.accounts[0];
    return {
      accountNumber: account.accountNumber,
      accountName: account.accountName,
      bankName: account.bankName,
      bankCode: account.bankCode,
      reference: data.responseBody.accountReference,
    };
  }

  async verifyTransaction(
    reference: string
  ): Promise<VerifyTransactionResult> {
    const token = await this.authenticate();

    const response = await fetch(
      `${this.config.baseUrl}/api/v1/v2/transactions/${reference}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    const data: MonnifyVerifyTransactionResponse = await response.json();

    if (!response.ok || !data.requestSuccessful) {
      Logger.error("Monnify transaction verification failed", {
        reference,
        responseMessage: data.responseMessage,
      });
      throw MonnifyProvider.mapError(response.status, data.responseMessage);
    }

    const body = data.responseBody;
    const status = body.paymentStatus ?? body.status ?? "PENDING";

    return {
      reference: body.paymentReference ?? reference,
      providerReference: body.transactionReference ?? reference,
      status: MonnifyProvider.mapVerificationStatus(status),
      amount: body.amountPaid ?? body.amount ?? 0,
      currency: body.currencyCode ?? "NGN",
      paidAt: body.paidOn ?? body.completedOn,
      raw: body,
    };
  }

  async initializePayment(
    params: InitializePaymentParams
  ): Promise<InitializePaymentResult> {
    const token = await this.authenticate();

    const response = await fetch(
      `${this.config.baseUrl}/api/v1/merchant/transactions/init-transaction`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: params.amount,
          customerEmail: params.customerEmail,
          customerName: params.customerName,
          paymentReference: params.reference,
          paymentDescription: "Wallet funding",
          currencyCode: params.currency,
          contractCode: this.config.contractCode,
          redirectUrl: params.redirectUrl,
          paymentMethods: ["CARD", "ACCOUNT_TRANSFER"],
        }),
      }
    );

    const data: MonnifyInitializePaymentResponse = await response.json();

    if (!response.ok || !data.requestSuccessful) {
      Logger.error("Monnify payment initialization failed", {
        reference: params.reference,
        responseMessage: data.responseMessage,
      });
      throw MonnifyProvider.mapError(response.status, data.responseMessage);
    }

    const body = data.responseBody;
    return {
      reference: body.paymentReference ?? params.reference,
      checkoutUrl: body.checkoutUrl,
      status: "initialized",
      amount: body.amount ?? params.amount,
      currency: (body.currencyCode ?? params.currency) as "NGN",
    };
  }

  async charge(params: ChargeParams): Promise<ChargeResult> {
    const token = await this.authenticate();

    const response = await fetch(
      `${this.config.baseUrl}/api/v1/merchant/charge`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          paymentMethodId: params.paymentMethodId,
          amount: params.amount,
          paymentReference: params.reference,
          currencyCode: params.currency,
          customerName: params.customerName,
          customerEmail: params.customerEmail,
        }),
      }
    );

    const data: MonnifyChargeResponse = await response.json();

    if (!response.ok || !data.requestSuccessful) {
      Logger.error("Monnify charge failed", {
        reference: params.reference,
        responseMessage: data.responseMessage,
      });
      throw MonnifyProvider.mapError(response.status, data.responseMessage);
    }

    const body = data.responseBody;
    return {
      reference: params.reference,
      providerReference: body.transactionReference,
      status: body.status === "SUCCESS" ? "success" : "failed",
      amount: body.amount,
      fee: body.totalFee,
      raw: data,
    };
  }

  private static buildVirtualAccountRequest(
    orgId: string
  ): VirtualAccountRequest {
    return {
      reference: `org-${orgId}`,
      accountName: `Org ${orgId}`,
      customerEmail: `org-${orgId}@vestroll.local`,
      customerName: `Organization ${orgId}`,
      currency: "NGN",
    };
  }

  private static mapVerificationStatus(
    status: string
  ): VerifyTransactionResult["status"] {
    if (status === "PAID" || status === "SUCCESS") {
      return "successful";
    }
    if (status === "FAILED" || status === "CANCELLED") {
      return "failed";
    }
    return "pending";
  }

  private static mapError(
    httpStatus: number,
    message?: string
  ): AppError {
    const msg = message ?? "Monnify request failed";
    if (httpStatus === 401 || httpStatus === 403) {
      return new UnauthorizedError(msg);
    }
    if (httpStatus >= 400 && httpStatus < 500) {
      return new BadRequestError(msg);
    }
    return new InternalServerError(msg);
  }
}
