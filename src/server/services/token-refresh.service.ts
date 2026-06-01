import { db } from "../db";
import { sessions, users } from "../db/schema";
import { eq } from "drizzle-orm";
import { JWTTokenService } from "./jwt-token.service";
import { JWTVerificationService } from "./jwt-verification.service";
import { PasswordVerificationService } from "./password-verification.service";
import {
  ExpiredTokenError,
  SessionNotFoundError,
  TokenSessionMismatchError,
  InternalAuthError,
} from "../utils/auth-errors";
import { Logger } from "./logger.service";

export class TokenRefreshService {
  static async refresh(
    refreshToken: string,
    _userAgent?: string,
    ipAddress?: string,
  ) {
    let payload;
    try {
      payload = await JWTVerificationService.verify(refreshToken);
    } catch (error) {
      Logger.error("Token refresh verification failed", {
        ipAddress,
        error: String(error),
      });
      throw error;
    }

    const sessionId = payload.sessionId as string;
    if (!sessionId) {
      Logger.error("Token refresh session ID missing", { ipAddress });
      throw new TokenSessionMismatchError("Token missing session ID");
    }

    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);

    if (!session) {
      Logger.error("Token refresh session not found", { sessionId, ipAddress });
      throw new SessionNotFoundError();
    }

    const isValid = await PasswordVerificationService.verify(
      refreshToken,
      session.refreshTokenHash,
    );

    if (!isValid) {
      Logger.error("Token refresh hash mismatch - potential replay attack", {
        sessionId,
        ipAddress,
      });

      await db.delete(sessions).where(eq(sessions.id, sessionId));
      throw new TokenSessionMismatchError("Invalid refresh token");
    }

    if (new Date() > session.expiresAt) {
      Logger.error("Token refresh session expired", { sessionId, ipAddress });
      await db.delete(sessions).where(eq(sessions.id, sessionId));
      throw new ExpiredTokenError("Session expired");
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1);
    if (!user) {
      throw new InternalAuthError("User not found");
    }

    const accessToken = await JWTTokenService.generateAccessToken({
      userId: user.id,
      email: user.email,
    });

    const newRefreshToken = await JWTTokenService.generateRotatedRefreshToken(
      {
        userId: user.id,
        email: user.email,
        sessionId,
      },
      payload.exp as number,
    );

    const newRefreshTokenHash =
      await PasswordVerificationService.hash(newRefreshToken);

    await db
      .update(sessions)
      .set({
        refreshTokenHash: newRefreshTokenHash,
        lastUsedAt: new Date(),
      })
      .where(eq(sessions.id, sessionId));

    Logger.info("Token refresh successful", { userId: user.id, sessionId });

    return {
      accessToken,
      refreshToken: newRefreshToken,
    };
  }
}
