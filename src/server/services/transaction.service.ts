import { Transaction } from "@/types/finance.types";
import { ListTransactionsInput } from "@/server/validations/finance.schema";
import { PaginatedResponse, toPaginatedResponse } from "@/types/pagination";

const mockTransactions: Transaction[] = [
  {
    id: "tx-001",
    type: "payout",
    description: "MintForge Bug fixes and performance updates",
    amount: "$1,200.00",
    asset: "USDT",
    status: "Successful",
    timestamp: "2025-10-25T14:00:00Z",
  },
  {
    id: "tx-002",
    type: "payout",
    description: "Monthly Server Hosting",
    amount: "$450.00",
    asset: "USDC",
    status: "Pending",
    timestamp: "2025-10-26T09:00:00Z",
  },
  {
    id: "tx-003",
    type: "deposit",
    description: "Wallet top-up from Stellar",
    amount: "$5,000.00",
    asset: "USDC",
    status: "Successful",
    timestamp: "2025-10-24T11:30:00Z",
  },
  {
    id: "tx-004",
    type: "withdrawal",
    description: "Withdrawal to external wallet",
    amount: "$800.00",
    asset: "XLM",
    status: "Failed",
    timestamp: "2025-10-23T16:45:00Z",
  },
  {
    id: "tx-005",
    type: "payout",
    description: "Contractor payment – October sprint",
    amount: "$3,200.00",
    asset: "USDT",
    status: "Successful",
    timestamp: "2025-10-22T10:00:00Z",
  },
  {
    id: "tx-006",
    type: "deposit",
    description: "Client invoice #1042 received",
    amount: "$7,500.00",
    asset: "USDC",
    status: "Successful",
    timestamp: "2025-10-21T08:15:00Z",
  },
  {
    id: "tx-007",
    type: "payout",
    description: "Design team salary – October",
    amount: "$4,600.00",
    asset: "USDT",
    status: "Successful",
    timestamp: "2025-10-20T09:00:00Z",
  },
  {
    id: "tx-008",
    type: "withdrawal",
    description: "Treasury rebalance",
    amount: "$2,000.00",
    asset: "XLM",
    status: "Pending",
    timestamp: "2025-10-19T13:30:00Z",
  },
  {
    id: "tx-009",
    type: "deposit",
    description: "Stellar grant disbursement",
    amount: "$10,000.00",
    asset: "USDC",
    status: "Successful",
    timestamp: "2025-10-18T07:00:00Z",
  },
  {
    id: "tx-010",
    type: "payout",
    description: "QA contractor – milestone 3",
    amount: "$900.00",
    asset: "USDT",
    status: "Failed",
    timestamp: "2025-10-17T15:20:00Z",
  },
  {
    id: "tx-011",
    type: "deposit",
    description: "Revenue share payment",
    amount: "$2,350.00",
    asset: "USDC",
    status: "Successful",
    timestamp: "2025-10-16T12:00:00Z",
  },
  {
    id: "tx-012",
    type: "payout",
    description: "Office supplies reimbursement",
    amount: "$125.00",
    asset: "USDT",
    status: "Successful",
    timestamp: "2025-10-15T14:10:00Z",
  },
];

export interface TransactionListResult {
  transactions: Transaction[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    resultsPerPage: number;
  };
}


export type { TransactionListResult as DeprecatedTransactionListResult };

export class TransactionService {
  static async listTransactions(
    filters: ListTransactionsInput
  ): Promise<PaginatedResponse<Transaction>> {
    const { page, limit, asset, status, type, sortBy, order } = filters;

    let filtered = [...mockTransactions];

    if (asset) {
      filtered = filtered.filter(
        (tx) => tx.asset?.toLowerCase() === asset.toLowerCase()
      );
    }

    if (status) {
      filtered = filtered.filter((tx) => tx.status === status);
    }

    if (type) {
      filtered = filtered.filter(
        (tx) => tx.type?.toLowerCase() === type.toLowerCase()
      );
    }

    const direction = order === "asc" ? 1 : -1;
    filtered.sort((a, b) => {
      let comparison: number;
      switch (sortBy) {
        case "status":
          comparison = (a.status ?? "").localeCompare(b.status ?? "");
          break;
        case "type":
          comparison = (a.type ?? "").localeCompare(b.type ?? "");
          break;
        case "date":
        default:
          comparison =
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
          break;
      }
      return comparison * direction;
    });

    const total = filtered.length;
    const start = (page - 1) * limit;
    const transactions = filtered.slice(start, start + limit);

    return toPaginatedResponse(transactions, page, limit, total);
  }
}
