export type FiatCurrency = "NGN";

export type DisbursementStatus = "pending" | "completed" | "failed";

export type TransactionVerificationStatus =
  | "pending"
  | "successful"
  | "failed";


export interface DisburseParams {
  amount: number;
  reference: string;
  narration: string;
  destinationBankCode: string;
  destinationAccountNumber: string;
  destinationAccountName: string;
  currency: FiatCurrency;
}


export interface DisburseResult {
  reference: string;
  providerReference: string;
  status: DisbursementStatus;
  amount: number;
  fee: number;
}


export interface VirtualAccountRequest {
  reference: string;
  accountName: string;
  customerEmail: string;
  customerName: string;
  currency: FiatCurrency;
}

export interface VirtualAccountResult {
  accountNumber: string;
  accountName: string;
  bankName: string;
  bankCode: string;
  reference: string;
}

export interface VerifyTransactionResult {
  reference: string;
  providerReference: string;
  status: TransactionVerificationStatus;
  amount: number;
  currency: FiatCurrency;
  paidAt?: string;
  raw?: unknown;
}

export interface InitializePaymentParams {
  amount: number;
  reference: string;
  customerEmail: string;
  customerName: string;
  currency: FiatCurrency;
  redirectUrl?: string;
}

export interface InitializePaymentResult {
  reference: string;
  paymentUrl?: string;
  checkoutUrl?: string;
  authorizationUrl?: string;
  status: "pending" | "initialized";
  amount: number;
  currency: FiatCurrency;
}

export interface ChargeParams {
  paymentMethodId: string;
  amount: number;
  reference: string;
  currency: FiatCurrency;
  customerEmail: string;
  customerName: string;
}

export interface ChargeResult {
  reference: string;
  providerReference: string;
  status: "success" | "failed";
  amount: number;
  fee: number;
  raw?: unknown;
}

export interface PaymentProvider {
  disburse(params: DisburseParams): Promise<DisburseResult>;
  generateVirtualAccount(orgId: string): Promise<VirtualAccountResult>;
  verifyTransaction(reference: string): Promise<VerifyTransactionResult>;
  initializePayment(params: InitializePaymentParams): Promise<InitializePaymentResult>;
  charge(params: ChargeParams): Promise<ChargeResult>;
}

export type DisburseRequest = DisburseParams;
