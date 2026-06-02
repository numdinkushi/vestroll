export type PayType = "salary" | "hourly";

export interface EmployeePayInput {
  employeeId: string;
  name?: string;
  payType: PayType;
  baseAmount: number;
  hoursWorked?: number;
  overtimeHours?: number;
}

export interface DeductionBreakdown {
  federalIncomeTax: number;
  stateTax: number;
  socialSecurity: number;
  medicare: number;
  total: number;
}

export interface EmployeePayResult {
  employeeId: string;
  name?: string;
  grossPay: number;
  deductions: DeductionBreakdown;
  netPay: number;
}

export interface PayrollCalculationResult {
  payPeriod: string;
  runAt: string;
  employees: EmployeePayResult[];
  totals: {
    grossPay: number;
    totalDeductions: number;
    netPay: number;
  };
}

const TAX_RATES = {
  federalIncomeTax: 0.22,
  stateTax: 0.05,
  socialSecurity: 0.062,
  medicare: 0.0145,
} as const;

const PAY_PERIODS_PER_YEAR = 26;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function computeGrossPay(input: EmployeePayInput): number {
  if (input.payType === "salary") {
    return round2(input.baseAmount / PAY_PERIODS_PER_YEAR);
  }
  const regularPay = (input.hoursWorked ?? 0) * input.baseAmount;
  const overtimePay = (input.overtimeHours ?? 0) * input.baseAmount * 1.5;
  return round2(regularPay + overtimePay);
}

function computeDeductions(grossPay: number): DeductionBreakdown {
  const federalIncomeTax = round2(grossPay * TAX_RATES.federalIncomeTax);
  const stateTax = round2(grossPay * TAX_RATES.stateTax);
  const socialSecurity = round2(grossPay * TAX_RATES.socialSecurity);
  const medicare = round2(grossPay * TAX_RATES.medicare);
  const total = round2(federalIncomeTax + stateTax + socialSecurity + medicare);
  return { federalIncomeTax, stateTax, socialSecurity, medicare, total };
}

export function calculatePayroll(employees: EmployeePayInput[]): PayrollCalculationResult {
  if (!employees || employees.length === 0) {
    throw new Error("At least one employee is required for payroll calculation.");
  }

  const results: EmployeePayResult[] = employees.map((emp) => {
    const grossPay = computeGrossPay(emp);
    const deductions = computeDeductions(grossPay);
    const netPay = round2(grossPay - deductions.total);
    return { employeeId: emp.employeeId, name: emp.name, grossPay, deductions, netPay };
  });

  const totals = results.reduce(
    (acc, r) => ({
      grossPay: round2(acc.grossPay + r.grossPay),
      totalDeductions: round2(acc.totalDeductions + r.deductions.total),
      netPay: round2(acc.netPay + r.netPay),
    }),
    { grossPay: 0, totalDeductions: 0, netPay: 0 }
  );

  return { payPeriod: "draft", runAt: new Date().toISOString(), employees: results, totals };
}