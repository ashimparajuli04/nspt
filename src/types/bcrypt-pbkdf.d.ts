declare module "bcrypt-pbkdf" {
  export function pbkdf(
    pass: string | Buffer,
    passlen: number,
    salt: Buffer,
    saltlen: number,
    key: Buffer,
    keylen: number,
    rounds: number
  ): void;
}
