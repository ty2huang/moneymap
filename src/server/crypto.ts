import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  createHash,
} from "node:crypto";
export function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
export function encrypt(value: string, key: Buffer, context: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(context));
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data]
    .map((b) => b.toString("base64url"))
    .join(".");
}
export function decrypt(value: string, key: Buffer, context: string) {
  const [iv, tag, data] = value
    .split(".")
    .map((s) => Buffer.from(s, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    "utf8",
  );
}
function master(version: string) {
  const keys = JSON.parse(process.env.MONEYMAP_MASTER_KEYS ?? "{}") as Record<
    string,
    string
  >;
  if (!keys[version]) {
    throw new Error("Encryption key is not configured");
  }
  const key = Buffer.from(keys[version], "base64");
  if (key.length !== 32) {
    throw new Error("Invalid key length");
  }
  return key;
}
export function wrapKey(key: Buffer, householdId: string) {
  const version = process.env.MONEYMAP_ACTIVE_KEY_VERSION ?? "1";
  return `${version}:${encrypt(key.toString("base64"), master(version), householdId)}`;
}
export function unwrapKey(value: string, householdId: string) {
  const separator = value.indexOf(":");
  return Buffer.from(
    decrypt(
      value.slice(separator + 1),
      master(value.slice(0, separator)),
      householdId,
    ),
    "base64",
  );
}
export function newKey(householdId: string) {
  return wrapKey(randomBytes(32), householdId);
}
