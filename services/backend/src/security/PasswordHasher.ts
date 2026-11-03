import * as argon2 from "argon2";
export class PasswordHasher {
  hash(password: string): Promise<string> {
    return argon2.hash(password);
  }
  verify(hash: string, password: string) {
    return argon2.verify(hash, password);
  }
}
