import * as jose from "jose";
import { InvalidTokenError, TokenExpiredError } from "../utils/errors";

export interface JWTPayload extends jose.JWTPayload {
  userId: string;
  email: string;
}

export class JWTService {
  private static normalizeExpiration(expiration: string): string | number {
    const msMatch = expiration.match(/^(\d+)ms$/);
    if (!msMatch) {
      return expiration;
    }

    const ms = Number(msMatch[1]);
    return Math.floor((Date.now() + ms) / 1000);
  }

  private static get ACCESS_SECRET() {
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret) {
      throw new Error("JWT_ACCESS_SECRET is not configured");
    }
    return new TextEncoder().encode(secret);
  }
  private static get REFRESH_SECRET() {
    const secret = process.env.JWT_REFRESH_SECRET;
    if (!secret) {
      throw new Error("JWT_REFRESH_SECRET is not configured");
    }
    return new TextEncoder().encode(secret);
  }
  private static get ACCESS_EXPIRATION() {
    return process.env.JWT_ACCESS_EXPIRATION || "15m";
  }
  private static get REFRESH_EXPIRATION() {
    return process.env.JWT_REFRESH_EXPIRATION || "7d";
  }

  static async generateAccessToken(payload: JWTPayload): Promise<string> {
    return await new jose.SignJWT(payload)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(this.normalizeExpiration(this.ACCESS_EXPIRATION))
      .sign(this.ACCESS_SECRET);
  }

  static async generateRefreshToken(payload: JWTPayload): Promise<string> {
    return await new jose.SignJWT(payload)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(this.normalizeExpiration(this.REFRESH_EXPIRATION))
      .sign(this.REFRESH_SECRET);
  }

  static async verifyAccessToken(token: string): Promise<JWTPayload> {
    try {
      const { payload } = await jose.jwtVerify(token, this.ACCESS_SECRET);
      return payload as JWTPayload;
    } catch (error) {
      if (error instanceof jose.errors.JWTExpired) {
        throw new TokenExpiredError("Access token has expired");
      }
      throw new InvalidTokenError("Invalid access token");
    }
  }

  static async verifyRefreshToken(token: string): Promise<JWTPayload> {
    try {
      const { payload } = await jose.jwtVerify(token, this.REFRESH_SECRET);
      return payload as JWTPayload;
    } catch (error) {
      if (error instanceof jose.errors.JWTExpired) {
        throw new TokenExpiredError("Refresh token has expired");
      }
      throw new InvalidTokenError("Invalid refresh token");
    }
  }
}
