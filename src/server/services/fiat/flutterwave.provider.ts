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

export interface FlutterwaveConfig {
  secretKey: string;
  baseUrl: string;
}

interface FlutterwaveApiResponse<T> {
  status: string;
  message?: string;
  data: T;
}

interface FlutterwaveDisbursementData {
  id: number | string;
  reference: string;
  status: string;
  amount: number;
  fee: number;
}

interface FlutterwaveVirtualAccountData {
  account_number: string;
  bank_name: string;
  order_ref: string;
}

interface FlutterwaveVerifiedTransactionData {
  tx_ref?: string;
  id?: number | string;
  status?: string;
  amount?: number | string;
  currency?: string;
  created_at?: string;
  [key: string]: unknown;
}

interface FlutterwaveInitializePaymentData {
  link?: string;
  checkout_url?: string;
  authorization_url?: string;
  tx_ref?: string;
  amount?: number;
  currency?: string;
}

interface FlutterwaveChargeData {
  id: string | number;
  status: string;
  amount: number;
  fee: number;
}

async function safeJson<T>(res: Response): Promise<T> {
  try {
    return (await res.json()) as T;
  } catch {
    throw new InternalServerError(
      `Flutterwave returned an invalid response (HTTP ${res.status})`,
    );
  }
}

export class FlutterwaveProvider implements PaymentProvider {
  private readonly config: FlutterwaveConfig;

  private readonly FLUTTERWAVE_STATUS_MAP: Record<string, DisburseResult["status"]> = {
    NEW: "pending",
    PENDING: "pending",
    SUCCESSFUL: "completed",
    FAILED: "failed",
  };

  constructor(config: FlutterwaveConfig) {
    this.config = config;
  }

  async disburse(request: DisburseParams): Promise<DisburseResult> {
    const response = await fetch(
      `${this.config.baseUrl}/v3/transfers`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.secretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          account_bank: request.destinationBankCode,
          account_number: request.destinationAccountNumber,
          amount: request.amount,
          narration: request.narration,
          currency: request.currency,
          reference: request.reference,
          debit_currency: request.currency,
        }),
      },
    );

    const data =
      await safeJson<FlutterwaveApiResponse<FlutterwaveDisbursementData>>(response);

    if (!response.ok || data.status !== "success") {
      Logger.error("Flutterwave disbursement failed", {
        reference: request.reference,
        message: data.message,
      });
      throw FlutterwaveProvider.mapError(response.status, data.message);
    }

    const body = data.data;
    return {
      reference: body.reference,
      providerReference: String(body.id),
      status: this.FLUTTERWAVE_STATUS_MAP[body.status] ?? "pending",
      amount: body.amount,
      fee: body.fee,
    };
  }

  async generateVirtualAccount(orgId: string): Promise<VirtualAccountResult>;
  async generateVirtualAccount(
    request: VirtualAccountRequest,
  ): Promise<VirtualAccountResult>;
  async generateVirtualAccount(
    orgIdOrRequest: string | VirtualAccountRequest,
  ): Promise<VirtualAccountResult> {
    const request =
      typeof orgIdOrRequest === "string"
        ? FlutterwaveProvider.buildVirtualAccountRequest(orgIdOrRequest)
        : orgIdOrRequest;
    const response = await fetch(
      `${this.config.baseUrl}/v3/virtual-account-numbers`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.secretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: request.customerEmail,
          is_permanent: true,
          tx_ref: request.reference,
          amount: 0,
          currency: request.currency,
        }),
      },
    );

    const data =
      await safeJson<FlutterwaveApiResponse<FlutterwaveVirtualAccountData>>(response);

    if (!response.ok || data.status !== "success") {
      Logger.error("Flutterwave virtual account creation failed", {
        reference: request.reference,
        message: data.message,
      });
      throw FlutterwaveProvider.mapError(response.status, data.message);
    }

    return {
      accountNumber: data.data.account_number,
      accountName: request.accountName,
      bankName: data.data.bank_name,
      bankCode: "",
      reference: data.data.order_ref,
    };
  }

  async verifyTransaction(
    reference: string,
  ): Promise<VerifyTransactionResult> {
    const response = await fetch(
      `${this.config.baseUrl}/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(reference)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.config.secretKey}`,
          "Content-Type": "application/json",
        },
      },
    );

    const data =
      await safeJson<FlutterwaveApiResponse<FlutterwaveVerifiedTransactionData>>(response);

    if (!response.ok || data.status !== "success") {
      Logger.error("Flutterwave transaction verification failed", {
        reference,
        message: data.message,
      });
      throw FlutterwaveProvider.mapError(response.status, data.message);
    }

    return {
      reference: data.data.tx_ref ?? reference,
      providerReference: String(data.data.id ?? reference),
      status: FlutterwaveProvider.mapVerificationStatus(data.data.status),
      amount: Number(data.data.amount ?? 0),
      currency: (data.data.currency ?? "NGN") as "NGN",
      paidAt: data.data.created_at,
      raw: data.data,
    };
  }

  async initializePayment(
    params: InitializePaymentParams,
  ): Promise<InitializePaymentResult> {
    const response = await fetch(
      `${this.config.baseUrl}/v3/charges?type=card`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.secretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tx_ref: params.reference,
          amount: params.amount,
          currency: params.currency,
          email: params.customerEmail,
          name: params.customerName,
          redirect_url: params.redirectUrl,
          payment_options: "card,account_transfer",
          customer: {
            email: params.customerEmail,
            name: params.customerName,
          },
        }),
      },
    );

    const data =
      await safeJson<FlutterwaveApiResponse<FlutterwaveInitializePaymentData>>(response);

    if (!response.ok || data.status !== "success") {
      Logger.error("Flutterwave payment initialization failed", {
        reference: params.reference,
        message: data.message,
      });
      throw FlutterwaveProvider.mapError(response.status, data.message);
    }

    return {
      reference: data.data.tx_ref ?? params.reference,
      paymentUrl: data.data.link,
      checkoutUrl: data.data.checkout_url,
      authorizationUrl: data.data.authorization_url,
      status: "initialized",
      amount: data.data.amount ?? params.amount,
      currency: (data.data.currency ?? params.currency) as "NGN",
    };
  }

  async charge(params: ChargeParams): Promise<ChargeResult> {
    const response = await fetch(
      `${this.config.baseUrl}/v3/charges`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.secretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tx_ref: params.reference,
          amount: params.amount,
          currency: params.currency,
          payment_method: params.paymentMethodId,
          customer: {
            email: params.customerEmail,
            name: params.customerName,
          },
        }),
      },
    );

    const data =
      await safeJson<FlutterwaveApiResponse<FlutterwaveChargeData>>(response);

    if (!response.ok || data.status !== "success") {
      Logger.error("Flutterwave charge failed", {
        reference: params.reference,
        message: data.message,
      });
      throw FlutterwaveProvider.mapError(response.status, data.message);
    }

    return {
      reference: params.reference,
      providerReference: String(data.data.id),
      status: data.data.status === "successful" ? "success" : "failed",
      amount: data.data.amount,
      fee: data.data.fee,
      raw: data,
    };
  }

  private static buildVirtualAccountRequest(
    orgId: string,
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
    status?: string,
  ): VerifyTransactionResult["status"] {
    if (status === "successful" || status === "SUCCESSFUL") {
      return "successful";
    }
    if (status === "failed" || status === "FAILED") {
      return "failed";
    }
    return "pending";
  }

  private static mapError(httpStatus: number, message?: string): AppError {
    const msg = message ?? "Flutterwave request failed";
    if (httpStatus === 401 || httpStatus === 403) {
      return new UnauthorizedError(msg);
    }
    if (httpStatus >= 400 && httpStatus < 500) {
      return new BadRequestError(msg);
    }
    return new InternalServerError(msg);
  }
}
