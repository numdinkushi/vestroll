import { NextRequest } from "next/server";
import { ApiResponse } from "@/server/utils/api-response";
import { AppError } from "@/server/utils/errors";
import { AuthUtils } from "@/server/utils/auth";
import { TwoFactorService } from "@/server/services/two-factor.service";
import { EmailService } from "@/server/services/email.service";
import { VerifyTwoFactorSchema } from "@/server/validations/two-factor.schema";
import { ZodError } from "zod";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { eq } from "drizzle-orm";

/**
 * @swagger
 * /auth/2fa/verify:
 *   post:
 *     summary: Verify 2FA during login
 *     description: Authenticate user with TOTP code or backup code after initial credentials verification
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *             properties:
 *               userId:
 *                 type: string
 *               totpCode:
 *                 type: string
 *                 description: 6-digit verification code
 *               backupCode:
 *                 type: string
 *                 description: One of the 10 backup codes
 *     responses:
 *       200:
 *         description: 2FA verification successful
 *       400:
 *         description: Invalid code or missing parameters
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Rate limit or account locked
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validatedData = VerifyTwoFactorSchema.parse(body);

    const ipAddress = AuthUtils.getClientIp(req);
    const userAgent = AuthUtils.getUserAgent(req);

    const result = await TwoFactorService.verifyTwoFactor(
      validatedData.userId,
      validatedData.totpCode,
      validatedData.backupCode,
      ipAddress,
      userAgent,
    );

    const [user] = await db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        status: users.status,
        twoFactorEnabled: users.twoFactorEnabled,
      })
      .from(users)
      .where(eq(users.id, validatedData.userId));

    if (!user) {
      return ApiResponse.error("User not found", 404);
    }

    const accessToken = await AuthUtils.generateToken(user.id, user.email);

    const refreshToken = await AuthUtils.generateToken(user.id, user.email);

    return ApiResponse.success(
      {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          status: user.status,
          twoFactorEnabled: user.twoFactorEnabled,
        },
        method: result.method,
      },
      "2FA verification successful",
      200,
    );
  } catch (error) {
    if (error instanceof AppError) {
      if (error.statusCode === 403 || error.statusCode === 429) {
        try {
          const body = await req.clone().json();
          if (body.userId) {
            const [user] = await db
              .select()
              .from(users)
              .where(eq(users.id, body.userId));

            if (user) {
              const ipAddress = AuthUtils.getClientIp(req);
              await EmailService.sendFailedTwoFactorAttemptEmail(
                user.email,
                user.firstName,
                ipAddress,
                user.failedTwoFactorAttempts,
              );

              if (error.message.includes("locked")) {
                await EmailService.sendAccountLockedEmail(
                  user.email,
                  user.firstName,
                );
              }
            }
          }
        } catch {}
      }

      return ApiResponse.error(error.message, error.statusCode, error.errors);
    }

    if (error instanceof ZodError) {
      const fieldErrors: Record<string, string> = {};
      error.issues.forEach((issue) => {
        if (issue.path[0]) {
          fieldErrors[issue.path[0].toString()] = issue.message;
        }
      });
      return ApiResponse.error("Validation failed", 400, { fieldErrors });
    }

    console.error("[2FA Verify Error]", error);

    return ApiResponse.error("Internal server error", 500);
  }
}
