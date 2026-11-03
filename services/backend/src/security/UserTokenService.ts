import { SignJWT, jwtVerify } from "jose";

export class UserTokenService {
  private readonly key: Uint8Array;
  private readonly issuer = "opengate";
  private readonly audience = "opengate-backend";
  readonly expiresInSeconds = 15 * 60;

  constructor(secret: string) {
    if (Buffer.byteLength(secret, "utf8") < 32) {
      throw new Error("JWT_SECRET must contain at least 32 bytes.");
    }
    this.key = new TextEncoder().encode(secret);
  }

  issue(userId: string): Promise<string> {
    return new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(userId)
      .setIssuer(this.issuer)
      .setAudience(this.audience)
      .setIssuedAt()
      .setExpirationTime(`${this.expiresInSeconds}s`)
      .sign(this.key);
  }

  async verify(token: string): Promise<string> {
    const { payload } = await jwtVerify(token, this.key, {
      algorithms: ["HS256"],
      issuer: this.issuer,
      audience: this.audience,
      requiredClaims: ["sub", "iat", "exp"],
    });
    if (!payload.sub) {
      throw new Error("Invalid token subject!");
    }
    return payload.sub;
  }
}
