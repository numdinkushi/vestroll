export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import {
  invoices,
  employees,
  organizations,
  companyProfiles,
} from "@/server/db/schema";
import { eq, and } from "drizzle-orm";
import { AuthUtils } from "@/server/utils/auth";
import { AppError } from "@/server/utils/errors";
import { ApiResponse } from "@/server/utils/api-response";
import jsPDF from "jspdf";

const UUID_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function isValidUUID(id: string): boolean {
  return UUID_REGEX.test(id);
}

function formatCurrency(amount: number, paidIn: string): string {
  if (paidIn === "crypto") {
    return `${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`;
  }
  return `NGN ${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

/**
 * @swagger
 * /payroll/{runId}/payslip/{employeeId}:
 *   get:
 *     summary: Generate PDF payslip
 *     description: >
 *       Generates and returns a downloadable PDF payslip for a specific
 *       employee and payroll execution record (invoice). The requesting user
 *       must belong to the same organization as the employee and invoice.
 *       Taxes and deductions are not stored in the current schema; the PDF
 *       reflects only the actual disbursed amount from the database.
 *     tags: [Payroll]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: runId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The invoice ID representing the payroll execution record (status must be "paid")
 *       - in: path
 *         name: employeeId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The employee ID
 *     responses:
 *       200:
 *         description: PDF payslip file
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: Invalid UUIDs in path
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: User not associated with an organization
 *       404:
 *         description: Payslip record not found
 *       500:
 *         description: Internal server error
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string; employeeId: string }> }
) {
  try {
    const { runId, employeeId } = await params;

    // --- Validate path params ---
    if (!isValidUUID(runId) || !isValidUUID(employeeId)) {
      return ApiResponse.error("Invalid UUID in path parameters", 400);
    }

    // --- Authenticate ---
    const { user } = await AuthUtils.authenticateRequestOrRefreshCookie(req);
    const organizationId = user.organizationId;
    if (!organizationId) {
      return ApiResponse.error(
        "User is not associated with any organization",
        403
      );
    }

    // --- Fetch invoice (payroll execution record) ---
    // runId == invoice.id. Invoice must be "paid", belong to the employee
    // and belong to the authenticated user's organization.
    const [invoice] = await db
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
          eq(invoices.id, runId),
          eq(invoices.employeeId, employeeId),
          eq(invoices.organizationId, organizationId),
          eq(invoices.status, "paid")
        )
      )
      .limit(1);

    if (!invoice) {
      return ApiResponse.error(
        "Payslip not found. The invoice may not exist, may not be paid, or may not belong to this employee.",
        404
      );
    }

    // --- Fetch employee details ---
    const [employee] = await db
      .select({
        id: employees.id,
        firstName: employees.firstName,
        lastName: employees.lastName,
        email: employees.email,
        role: employees.role,
        department: employees.department,
        type: employees.type,
        bankName: employees.bankName,
        accountNumber: employees.accountNumber,
        accountHolderName: employees.accountHolderName,
      })
      .from(employees)
      .where(
        and(
          eq(employees.id, employeeId),
          eq(employees.organizationId, organizationId)
        )
      )
      .limit(1);

    if (!employee) {
      return ApiResponse.error("Employee not found", 404);
    }

    // --- Fetch company profile and organization ---
    const [[org], [companyProfile]] = await Promise.all([
      db
        .select({
          name: organizations.name,
          registeredStreet: organizations.registeredStreet,
          registeredCity: organizations.registeredCity,
          registeredState: organizations.registeredState,
          registeredCountry: organizations.registeredCountry,
          registrationNumber: organizations.registrationNumber,
        })
        .from(organizations)
        .where(eq(organizations.id, organizationId))
        .limit(1),
      db
        .select({
          brandName: companyProfiles.brandName,
          registeredName: companyProfiles.registeredName,
          registrationNumber: companyProfiles.registrationNumber,
          address: companyProfiles.address,
          city: companyProfiles.city,
          country: companyProfiles.country,
        })
        .from(companyProfiles)
        .where(eq(companyProfiles.organizationId, organizationId))
        .limit(1),
    ]);

    const companyName =
      companyProfile?.brandName ?? org?.name ?? "Vestroll Inc.";
    const companyAddress = companyProfile
      ? `${companyProfile.address}, ${companyProfile.city}, ${companyProfile.country}`
      : [
          org?.registeredStreet,
          org?.registeredCity,
          org?.registeredState,
          org?.registeredCountry,
        ]
          .filter(Boolean)
          .join(", ") || "N/A";
    const companyRegNo =
      companyProfile?.registrationNumber ??
      org?.registrationNumber ??
      "N/A";

    // --- Build PDF ---
    const pdf = buildPayslipPDF({
      invoice,
      employee,
      companyName,
      companyAddress,
      companyRegNo,
    });

    const filename = `payslip-${invoice.invoiceNo}-${employee.firstName}-${employee.lastName}.pdf`
      .toLowerCase()
      .replace(/\s+/g, "-");

    return new NextResponse(Buffer.from(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof AppError) {
      return ApiResponse.error(error.message, error.statusCode);
    }
    console.error("[Payslip PDF Error]", error);
    return ApiResponse.error("Internal server error", 500);
  }
}

// ---------------------------------------------------------------------------
// PDF builder
// ---------------------------------------------------------------------------

interface PayslipData {
  invoice: {
    id: string;
    invoiceNo: string;
    title: string;
    amount: number;
    paidIn: string;
    status: string;
    issueDate: Date | string;
  };
  employee: {
    firstName: string;
    lastName: string;
    email: string;
    role: string;
    department: string | null;
    type: string;
    bankName: string | null;
    accountNumber: string | null;
    accountHolderName: string | null;
  };
  companyName: string;
  companyAddress: string;
  companyRegNo: string;
}

function buildPayslipPDF(data: PayslipData): Uint8Array {
  const { invoice, employee, companyName, companyAddress, companyRegNo } = data;

  // A4: 210mm x 297mm
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const W = 210;
  const MARGIN = 15;
  const CONTENT_W = W - MARGIN * 2;
  const PURPLE = "#5E2A8C";
  const LIGHT_PURPLE = "#EDE9FE";
  const DARK_TEXT = "#111827";
  const MUTED = "#6B7280";
  const BORDER = "#E5E7EB";
  const WHITE = "#FFFFFF";

  let y = 0;

  // ---- HEADER BANNER ----
  doc.setFillColor(PURPLE);
  doc.rect(0, 0, W, 28, "F");

  doc.setTextColor(WHITE);
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text("VESTROLL", MARGIN, 13);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("PAYSLIP", MARGIN, 19);

  // Status badge on the right
  const statusText = "PAID";
  doc.setFillColor("#22C55E");
  doc.roundedRect(W - MARGIN - 22, 8, 22, 9, 2, 2, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(WHITE);
  doc.text(statusText, W - MARGIN - 11, 13.5, { align: "center" });

  y = 36;

  // ---- COMPANY & PAYSLIP INFO ROW ----
  doc.setTextColor(DARK_TEXT);

  // Left: Employer block
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(MUTED);
  doc.text("EMPLOYER", MARGIN, y);

  y += 5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(DARK_TEXT);
  doc.text(companyName, MARGIN, y);

  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(MUTED);

  // Wrap long address
  const addressLines = doc.splitTextToSize(companyAddress, 85);
  doc.text(addressLines, MARGIN, y);
  y += addressLines.length * 4;

  doc.text(`Reg. No: ${companyRegNo}`, MARGIN, y);

  // Right: Payslip metadata
  const rightX = W / 2 + 5;
  let metaY = 36;

  const meta = [
    ["Payslip No:", invoice.invoiceNo],
    ["Pay Date:", formatDate(invoice.issueDate)],
    ["Pay Period:", invoice.title],
    ["Payment Method:", invoice.paidIn === "crypto" ? "Crypto (USDT)" : "Fiat (NGN)"],
    ["Contract Type:", employee.type],
  ];

  meta.forEach(([label, value]) => {
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(MUTED);
    doc.text(label, rightX, metaY);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(DARK_TEXT);
    doc.text(String(value), rightX + 38, metaY);
    metaY += 6;
  });

  y = Math.max(y, metaY) + 6;

  // ---- DIVIDER ----
  doc.setDrawColor(BORDER);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, y, W - MARGIN, y);
  y += 8;

  // ---- EMPLOYEE INFO BLOCK ----
  doc.setFillColor(LIGHT_PURPLE);
  doc.roundedRect(MARGIN, y, CONTENT_W, 28, 3, 3, "F");

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(PURPLE);
  doc.text("EMPLOYEE DETAILS", MARGIN + 5, y + 7);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(DARK_TEXT);
  doc.text(
    `${employee.firstName} ${employee.lastName}`,
    MARGIN + 5,
    y + 14
  );

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(MUTED);
  const empDetails = [
    employee.role,
    employee.department ?? "",
    employee.email,
  ]
    .filter(Boolean)
    .join("  •  ");
  doc.text(empDetails, MARGIN + 5, y + 20);

  // Right side of employee block: bank info
  const bankX = W / 2 + 5;
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(MUTED);
  doc.text("Bank:", bankX, y + 10);
  doc.text("Account:", bankX, y + 16);
  doc.text("Account Name:", bankX, y + 22);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(DARK_TEXT);
  doc.text(employee.bankName ?? "N/A", bankX + 28, y + 10);
  doc.text(employee.accountNumber ?? "N/A", bankX + 28, y + 16);
  doc.text(employee.accountHolderName ?? "N/A", bankX + 28, y + 22);

  y += 36;

  // ---- EARNINGS & DEDUCTIONS TABLE ----
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(DARK_TEXT);
  doc.text("Earnings & Deductions", MARGIN, y);
  y += 6;

  // Table header
  doc.setFillColor(PURPLE);
  doc.rect(MARGIN, y, CONTENT_W, 8, "F");

  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(WHITE);
  doc.text("Description", MARGIN + 4, y + 5.5);
  doc.text("Type", MARGIN + 90, y + 5.5);
  doc.text("Amount", W - MARGIN - 4, y + 5.5, { align: "right" });
  y += 8;

  // Table rows
  interface TableRow {
    description: string;
    type: string;
    amount: string;
    isCredit: boolean;
  }

  const tableRows: TableRow[] = [
    {
      description: invoice.title || "Gross Pay",
      type: "Earnings",
      amount: formatCurrency(invoice.amount, invoice.paidIn),
      isCredit: true,
    },
    {
      description: "Income Tax",
      type: "Deduction",
      amount: "N/A",
      isCredit: false,
    },
    {
      description: "Pension / Other Deductions",
      type: "Deduction",
      amount: "N/A",
      isCredit: false,
    },
  ];

  tableRows.forEach((row, i) => {
    const rowBg = i % 2 === 0 ? WHITE : "#F9FAFB";
    doc.setFillColor(rowBg);
    doc.rect(MARGIN, y, CONTENT_W, 8, "F");

    doc.setDrawColor(BORDER);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, y + 8, W - MARGIN, y + 8);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(DARK_TEXT);
    doc.text(row.description, MARGIN + 4, y + 5.5);

    doc.setTextColor(row.isCredit ? "#22C55E" : MUTED);
    doc.text(row.type, MARGIN + 90, y + 5.5);

    doc.setTextColor(DARK_TEXT);
    doc.text(row.amount, W - MARGIN - 4, y + 5.5, { align: "right" });

    y += 8;
  });

  y += 4;

  // ---- NET PAY BOX ----
  doc.setFillColor(PURPLE);
  doc.roundedRect(MARGIN, y, CONTENT_W, 16, 3, 3, "F");

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(WHITE);
  doc.text("NET TAKE-HOME PAY", MARGIN + 5, y + 6);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(LIGHT_PURPLE);
  doc.text(
    "(Gross pay — taxes and deductions not computed in current schema)",
    MARGIN + 5,
    y + 11
  );

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(WHITE);
  doc.text(
    formatCurrency(invoice.amount, invoice.paidIn),
    W - MARGIN - 4,
    y + 9,
    { align: "right" }
  );

  y += 24;

  // ---- FOOTER DISCLAIMER ----
  doc.setDrawColor(BORDER);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, y, W - MARGIN, y);
  y += 5;

  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(MUTED);

  const disclaimer =
    "This payslip presents actual disbursed payroll amounts as recorded in the system. " +
    "Taxes and deductions are not computed for this transaction as they are not currently stored in the payroll schema. " +
    "This document is electronically generated and is valid without a signature.";

  const disclaimerLines = doc.splitTextToSize(disclaimer, CONTENT_W);
  doc.text(disclaimerLines, MARGIN, y);
  y += disclaimerLines.length * 4 + 4;

  doc.setFont("helvetica", "bold");
  doc.setTextColor(PURPLE);
  doc.text("Vestroll — Powered by SafeVault", MARGIN, y);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(MUTED);
  doc.text(
    `Generated: ${new Date().toUTCString()}`,
    W - MARGIN,
    y,
    { align: "right" }
  );

  return doc.output("arraybuffer") as unknown as Uint8Array;
}
