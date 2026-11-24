import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { IRefreshTokenRepository } from "../repositories/RefreshTokenRepository";
import { AppError } from "../errors/AppError";

export interface RefreshTokenOptions {
  /** How long a refresh token lasts; each refresh starts a new one. Default 30 days. */
  ttlSeconds?: number;
  /**
   * How long after a token is used it may be presented again without being
   * treated as stolen. Covers parallel requests from one browser that all
   * refresh with the same cookie. Default 30 seconds.
   */
  reuseGraceSeconds?: number;
  now?: () => Date;
}

export interface IssuedRefreshToken {
  token: string;
  expiresIn: number;
}

const INVALID = "Invalid or expired refresh token";

function hash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Opaque, rotating refresh tokens. Each sign-in starts a family; each refresh
 * uses up the presented token and issues the next one in the same family.
 * Presenting a used token again (outside a short grace period) means it was
 * copied, so the whole family is revoked and that sign-in ends everywhere.
 */
export class RefreshTokenService {
  readonly ttlSeconds: number;
  private readonly graceMs: number;
  private readonly now: () => Date;

  constructor(
    private readonly repo: IRefreshTokenRepository,
    options: RefreshTokenOptions = {},
  ) {
    this.ttlSeconds = options.ttlSeconds ?? 30 * 24 * 60 * 60;
    this.graceMs = (options.reuseGraceSeconds ?? 30) * 1000;
    this.now = options.now ?? (() => new Date());
  }

  /** Starts a new family (a sign-in), or continues `familyId` (a refresh). */
  async issue(userId: string, familyId: string = randomUUID()): Promise<IssuedRefreshToken> {
    const token = randomBytes(32).toString("base64url");
    await this.repo.create({
      userId,
      familyId,
      tokenHash: hash(token),
      expiresAt: new Date(this.now().getTime() + this.ttlSeconds * 1000),
    });
    return { token, expiresIn: this.ttlSeconds };
  }

  /** Uses up `token` and returns its user and the next token. Throws 401 if it can't be used. */
  async rotate(token: string): Promise<{ userId: string } & IssuedRefreshToken> {
    const record = await this.repo.findByHash(hash(token));
    const now = this.now();
    if (!record || record.revokedAt || record.expiresAt <= now) {
      throw new AppError(401, INVALID);
    }

    const claimed = !record.usedAt && (await this.repo.markUsed(record.id, now));
    if (!claimed) {
      // Used already: fine if it was a moment ago (parallel requests), theft otherwise.
      const usedAt = record.usedAt ?? now;
      if (now.getTime() - usedAt.getTime() > this.graceMs) {
        await this.repo.revokeFamily(record.familyId, now);
        throw new AppError(401, INVALID);
      }
    }

    const next = await this.issue(record.userId, record.familyId);
    return { userId: record.userId, ...next };
  }

  /** Signs out the sign-in `token` belongs to. Unknown tokens are ignored. */
  async revoke(token: string): Promise<void> {
    const record = await this.repo.findByHash(hash(token));
    if (record) await this.repo.revokeFamily(record.familyId, this.now());
  }

  /** Signs the user out everywhere, except the sign-in `keepToken` belongs to. */
  async revokeAllForUser(userId: string, keepToken?: string): Promise<void> {
    const keep = keepToken ? await this.repo.findByHash(hash(keepToken)) : null;
    const exceptFamilyId = keep?.userId === userId ? keep.familyId : undefined;
    await this.repo.revokeAllForUser(userId, this.now(), exceptFamilyId);
  }
}
