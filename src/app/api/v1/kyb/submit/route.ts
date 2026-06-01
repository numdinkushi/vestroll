import { NextRequest } from "next/server";
import { ApiResponse } from "@/server/utils/api-response";
import { AppError, ValidationError } from "@/server/utils/errors";
import { AuthUtils } from "@/server/utils/auth";
import {
  KybSubmitSchema,
  KYB_FILE_CONSTRAINTS,
} from "@/server/validations/kyb.schema";
import { KybService } from "@/server/services/kyb.service";
import { KybUploadService } from "@/server/services/kyb-upload.service";
import { ZodError } from "zod";
import { withKybRateLimit } from "@/server/services/rate-limit.service";

/**
 * @swagger
 * /kyb/submit:
 *   post:
 *     summary: Submit KYB documents
 *     description: Upload business registration documents for KYB verification
 *     tags: [General]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - registrationType
 *               - registrationNo
 *               - incorporationCertificatePath
 *               - memorandumArticlePath
 *             properties:
 *               registrationType:
 *                 type: string
 *               registrationNo:
 *                 type: string
 *               incorporationCertificatePath:
 *                 type: string
 *               memorandumArticlePath:
 *                 type: string
 *               formC02C07Path:
 *                 type: string
 *     responses:
 *       201:
 *         description: KYB documents submitted successfully
 *       400:
 *         description: Validation failed
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       409:
 *         description: KYB already submitted or approved
 */
export const POST = withKybRateLimit(async (req: NextRequest) => {
  try {
    const { userId } = await AuthUtils.authenticateRequest(req);
    const body = await req.json();

    const {
      registrationType,
      registrationNo,
      incorporationCertificatePath,
      memorandumArticlePath,
      formC02C07Path,
    } = body;

    const validatedFields = KybSubmitSchema.parse({
      registrationType,
      registrationNo,
    });

    if (!incorporationCertificatePath) {
      throw new ValidationError("Validation failed", {
        fieldErrors: { incorporationCertificatePath: "Path is required" },
      });
    }

    if (!memorandumArticlePath) {
      throw new ValidationError("Validation failed", {
        fieldErrors: { memorandumArticlePath: "Path is required" },
      });
    }

    const result = await KybService.submit({
      userId,
      registrationType: validatedFields.registrationType,
      registrationNo: validatedFields.registrationNo,
      incorporationCertificatePath: incorporationCertificatePath,
      incorporationCertificateUrl: KybUploadService.getPublicUrl(
        incorporationCertificatePath,
      ),
      memorandumArticlePath: memorandumArticlePath,
      memorandumArticleUrl: KybUploadService.getPublicUrl(
        memorandumArticlePath,
      ),
      formC02C07Path: formC02C07Path ?? null,
      formC02C07Url: formC02C07Path
        ? KybUploadService.getPublicUrl(formC02C07Path)
        : null,
    });

    return ApiResponse.success(
      result,
      "KYB documents submitted successfully",
      201,
    );
  } catch (error) {
    if (error instanceof ZodError) {
      const fieldErrors: Record<string, string> = {};
      error.issues.forEach((issue: any) => {
        if (issue.path[0]) {
          fieldErrors[issue.path[0].toString()] = issue.message;
        }
      });
      return ApiResponse.error("Validation failed", 400, { fieldErrors });
    }

    if (error instanceof AppError) {
      return ApiResponse.error(error.message, error.statusCode, error.errors);
    }

    console.error("[KYB Submit Error]", error);
    return ApiResponse.error("Internal server error", 500);
  }
});
