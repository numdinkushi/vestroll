import { db } from "@/server/db";
import { invoices, employees, fiatTransactions } from "@/server/db/schema";
import { eq, ilike, or, and } from "drizzle-orm";

export interface SearchEmployeeResult {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
}

export interface SearchInvoiceResult {
  id: string;
  invoiceNo: string;
  title: string;
  amount: number | string;
  paidIn: string;
  status: string;
  issueDate: string;
}

export interface SearchTransactionResult {
  id: string;
  type: string;
  amount: string;
  provider: string;
  status: string;
  reference: string | null;
  createdAt: string;
}

export interface GlobalSearchResult {
  employees: SearchEmployeeResult[];
  invoices: SearchInvoiceResult[];
  transactions: SearchTransactionResult[];
}

function escapeSearchTerm(term: string): string {
  return term.replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export class SearchService {
  static async globalSearch(
    organizationId: string,
    query: string,
  ): Promise<GlobalSearchResult> {
    const escapedQuery = escapeSearchTerm(query.trim());
    const searchTerm = `%${escapedQuery}%`;

    const employeeQuery = db
      .select({
        id: employees.id,
        firstName: employees.firstName,
        lastName: employees.lastName,
        email: employees.email,
        role: employees.role,
        status: employees.status,
      })
      .from(employees)
      .where(
        and(
          eq(employees.organizationId, organizationId),
          or(
            ilike(employees.firstName, searchTerm),
            ilike(employees.lastName, searchTerm),
          )!,
        ),
      )
      .orderBy(employees.firstName)
      .limit(10);

    const invoiceQuery = db
      .select({
        id: invoices.id,
        invoiceNo: invoices.invoiceNo,
        title: invoices.title,
        amount: invoices.amount,
        paidIn: invoices.paidIn,
        status: invoices.status,
        issueDate: invoices.issueDate,
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.organizationId, organizationId),
          ilike(invoices.invoiceNo, searchTerm),
        ),
      )
      .orderBy(invoices.issueDate)
      .limit(10);

    const transactionQuery = db
      .select({
        id: fiatTransactions.id,
        type: fiatTransactions.type,
        amount: fiatTransactions.amount,
        provider: fiatTransactions.provider,
        status: fiatTransactions.status,
        reference: fiatTransactions.reference,
        providerReference: fiatTransactions.providerReference,
        createdAt: fiatTransactions.createdAt,
      })
      .from(fiatTransactions)
      .where(
        and(
          eq(fiatTransactions.organizationId, organizationId),
          or(
            ilike(fiatTransactions.reference, searchTerm),
            ilike(fiatTransactions.providerReference, searchTerm),
          )!,
        ),
      )
      .orderBy(fiatTransactions.createdAt)
      .limit(10);

    const [employeeRows, invoiceRows, transactionRows] = await Promise.all([
      employeeQuery,
      invoiceQuery,
      transactionQuery,
    ]);

    return {
      employees: employeeRows.map((employee) => ({
        id: employee.id,
        name: `${employee.firstName} ${employee.lastName}`,
        email: employee.email,
        role: employee.role,
        status: employee.status,
      })),
      invoices: invoiceRows.map((invoice) => ({
        id: invoice.id,
        invoiceNo: invoice.invoiceNo,
        title: invoice.title,
        amount: invoice.amount,
        paidIn: invoice.paidIn,
        status: invoice.status,
        issueDate: invoice.issueDate.toISOString(),
      })),
      transactions: transactionRows.map((transaction) => ({
        id: transaction.id,
        type: transaction.type,
        amount: transaction.amount.toString(),
        provider: transaction.provider,
        status: transaction.status,
        reference:
          transaction.reference ?? transaction.providerReference ?? null,
        createdAt: transaction.createdAt.toISOString(),
      })),
    };
  }
}
