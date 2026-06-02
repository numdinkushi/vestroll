import { NextRequest } from "next/server";
import { z } from "zod";
import { ApiResponse } from "@/server/utils/api-response";
import { AppError } from "@/server/utils/errors";

const StateTaxQuerySchema = z.object({
  state: z
    .string()
    .trim()
    .transform((value) => value.toUpperCase())
    .regex(/^[A-Z]{2}$/, "State must be a valid two-letter code")
    .optional(),
});

const TAX_RATE_DATA = {
  federal: 22,
  stateRates: {
    CA: 9.3,
    NY: 6.85,
    TX: 0,
    FL: 0,
    NJ: 5.525,
    GA: 5.75,
    IL: 4.95,
    WA: 0,
    PA: 3.07,
    OH: 3.99,
  },
};

const getStateTaxRate = (stateCode: string) => {
  return TAX_RATE_DATA.stateRates[stateCode] ?? null;
};

/**
 * @swagger
 * /payroll/tax-rates:
 *   get:
 *     summary: Fetch payroll tax rates
 *     description: Returns standard federal and state tax percentage rates used by the payroll deduction engine.
 *     tags: [Payroll]
 *     parameters:
 *       - in: query
 *         name: state
 *         schema:
 *           type: string
 *           description: Two-letter state code to retrieve a specific state tax rate.
 *     responses:
 *       200:
 *         description: Tax rates returned successfully
 *       400:
 *         description: Invalid state code provided
 */
export async function GET(req: NextRequest) {
  try {
    const query = Object.fromEntries(req.nextUrl.searchParams.entries());
    const parsed = StateTaxQuerySchema.safeParse(query);

    if (!parsed.success) {
      return ApiResponse.error("Invalid query parameter", 400, parsed.error.flatten().fieldErrors);
    }

    const { state } = parsed.data;
    const responseData: Record<string, unknown> = {
      federal: TAX_RATE_DATA.federal,
      stateRates: TAX_RATE_DATA.stateRates,
    };

    if (state) {
      const stateRate = getStateTaxRate(state);

      if (stateRate === null) {
        return ApiResponse.error(
          `Tax rates are not available for state code '${state}'`,
          400,
          { state: [`Unknown state code: ${state}`] },
        );
      }

      responseData.selectedState = {
        code: state,
        incomeTaxRate: stateRate,
      };
    }

    return ApiResponse.success(responseData, "Payroll tax rates retrieved successfully");
  } catch (error) {
    if (error instanceof AppError) {
      return ApiResponse.error(error.message, error.statusCode, error.errors);
    }

    console.error("[Payroll Tax Rates GET Error]", error);
    return ApiResponse.error("Internal server error", 500);
  }
}
