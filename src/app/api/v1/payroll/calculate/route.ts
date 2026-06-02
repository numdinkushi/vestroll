import { NextRequest, NextResponse } from "next/server";
import { calculatePayroll, type EmployeePayInput } from "@/server/services/payroll.calculation.service";

function isValidPayType(value: unknown): value is "salary" | "hourly" {
  return value === "salary" || value === "hourly";
}

function validateEmployees(data: unknown): {
  valid: boolean;
  errors: string[];
  employees: EmployeePayInput[];
} {
  const errors: string[] = [];

  if (!Array.isArray(data) || data.length === 0) {
    return {
      valid: false,
      errors: ["Request body must contain a non-empty `employees` array."],
      employees: [],
    };
  }

  const employees: EmployeePayInput[] = [];

  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    const prefix = `employees[${i}]`;

    if (!item || typeof item !== "object") {
      errors.push(`${prefix}: must be an object.`);
      continue;
    }

    if (typeof item.employeeId !== "string" || !item.employeeId.trim()) {
      errors.push(`${prefix}.employeeId: required string.`);
    }

    if (!isValidPayType(item.payType)) {
      errors.push(`${prefix}.payType: must be "salary" or "hourly".`);
    }

    if (typeof item.baseAmount !== "number" || item.baseAmount <= 0) {
      errors.push(`${prefix}.baseAmount: must be a positive number.`);
    }

    if (item.payType === "hourly") {
      if (item.hoursWorked === undefined || typeof item.hoursWorked !== "number" || item.hoursWorked < 0) {
        errors.push(`${prefix}.hoursWorked: required non-negative number for hourly employees.`);
      }
      if (item.overtimeHours !== undefined && (typeof item.overtimeHours !== "number" || item.overtimeHours < 0)) {
        errors.push(`${prefix}.overtimeHours: must be a non-negative number.`);
      }
    }

    if (errors.length === 0) {
      employees.push({
        employeeId: item.employeeId,
        name: item.name,
        payType: item.payType,
        baseAmount: item.baseAmount,
        hoursWorked: item.hoursWorked,
        overtimeHours: item.overtimeHours,
      });
    }
  }

  return { valid: errors.length === 0, errors, employees };
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON body." }, { status: 400 });
  }

  const { valid, errors, employees } = validateEmployees(body?.employees);

  if (!valid) {
    return NextResponse.json({ success: false, message: "Validation failed.", errors }, { status: 422 });
  }

  try {
    const result = calculatePayroll(employees);
    return NextResponse.json({ success: true, data: result }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Payroll calculation failed.";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}