import { NextRequest, NextResponse } from "next/server";
import { AppError, ValidationError } from "./errors";
import { ApiResponse } from "./api-response";
import { AuthUtils } from "./auth";
import { Logger } from "../services/logger.service";
import crypto from "crypto";
import { z } from "zod";

export interface RequestMetadata {
  ipAddress?: string;
  userAgent?: string;
}

export interface HandlerContext<T = any> {
  params: Promise<any>;
  body: T;
  metadata: RequestMetadata;
}

export function withHandler<T = any>(
  options:
    | { schema?: z.ZodSchema<T> }
    | ((req: NextRequest, ctx: any) => Promise<NextResponse>),
  handler?: (req: NextRequest, ctx: HandlerContext<T>) => Promise<NextResponse>,
) {
  if (typeof options === "function") {
    return withHandler({}, options);
  }

  const { schema } = options;

  return async (req: NextRequest, ctx: any): Promise<NextResponse> => {
    try {
      const instance = req?.nextUrl?.pathname ?? "unknown";
      const method = req?.method ?? "UNKNOWN";

      Logger.info?.(`[Request] ${method} ${instance}`);

      const metadata: RequestMetadata = {
        ipAddress: AuthUtils.getClientIp(req),
        userAgent: AuthUtils.getUserAgent(req),
      };

      let body: T = {} as T;
      if (schema) {
        try {
          const rawBody = await req.json();
          const validated = schema.safeParse(rawBody);
          if (!validated.success) {
            throw new ValidationError(
              "Invalid request body",
              validated.error.flatten().fieldErrors as any,
            );
          }
          body = validated.data;
        } catch (e) {
          if (e instanceof ValidationError) throw e;
          if (e instanceof SyntaxError) {
            throw new ValidationError("Invalid JSON in request body");
          }
          throw new ValidationError("Failed to parse request body");
        }
      }

      const responseId = crypto.randomUUID();

      const response = await handler!(req, { ...ctx, body, metadata });
      response.headers.set("X-Response-Id", responseId);

      Logger.info?.(`[Success] ${method} ${instance}`, {
        responseId,
        status: response.status,
      });

      return response;
    } catch (error) {
      const instance = req?.nextUrl?.pathname ?? "unknown";
      const method = req?.method ?? "UNKNOWN";
      const responseId = crypto.randomUUID();

      if (error instanceof AppError) {
        Logger.error?.(`[App Error] ${method} ${instance}`, {
          responseId,
          type: error.name,
          message: error.message,
          errors: error.errors,
        });
        const response = ApiResponse.error(
          error.message,
          error.status,
          error.errors,
          req,
        ) as NextResponse;
        response.headers.set("X-Response-Id", responseId);
        return response;
      }

      Logger.error?.(`[Unhandled Error] ${method} ${instance}`, {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        responseId,
      });

      const response = ApiResponse.error(
        "Internal server error",
        500,
        null,
        req,
      ) as NextResponse;

      response.headers.set("X-Response-Id", responseId);
      return response;
    }
  };
}

export const withErrorHandler = withHandler;
