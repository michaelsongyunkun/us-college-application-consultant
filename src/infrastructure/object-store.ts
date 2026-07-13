import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export interface ObjectStore {
  put(input: any): Promise<any>;
  get(input: any): Promise<any>;
  delete(input: any): Promise<void>;
  getSignedDownloadUrl(input: any): Promise<{ url: string; expiresAt: string }>;
}

export function createLocalObjectStore({ root, signingSecret, now = () => Date.now() }: any): ObjectStore & { readSignedUrl(url: string): Promise<any> } {
  if (!signingSecret || signingSecret.length < 16) throw new Error("Object store signing secret must be at least 16 characters.");
  const absoluteRoot = resolve(root);
  return {
    async put({ userId, key, body, contentType = "application/octet-stream", expiresAt = null }: any) {
      const objectKey = userObjectKey(userId, key);
      const path = resolveLocalPath(absoluteRoot, objectKey);
      const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, buffer);
      await writeFile(`${path}.metadata.json`, JSON.stringify({ id: randomUUID(), userId: Number(userId), objectKey, contentType, contentLength: buffer.length, contentHash: sha256(buffer), createdAt: new Date(now()).toISOString(), expiresAt }), "utf8");
      return { objectKey, contentType, contentLength: buffer.length, contentHash: sha256(buffer), expiresAt };
    },
    async get({ userId, key }: any) {
      const objectKey = userObjectKey(userId, key);
      const path = resolveLocalPath(absoluteRoot, objectKey);
      try {
        const [body, metadata] = await Promise.all([readFile(path), readFile(`${path}.metadata.json`, "utf8")]);
        return { ...JSON.parse(metadata), body };
      } catch (error: any) {
        if (error?.code === "ENOENT") throw new Error("Object not found");
        throw error;
      }
    },
    async delete({ userId, key }: any) {
      const path = resolveLocalPath(absoluteRoot, userObjectKey(userId, key));
      await Promise.all([unlink(path).catch(ignoreMissing), unlink(`${path}.metadata.json`).catch(ignoreMissing)]);
    },
    async getSignedDownloadUrl({ userId, key, expiresInSeconds = 300 }: any) {
      validateExpiry(expiresInSeconds);
      await this.get({ userId, key });
      const objectKey = userObjectKey(userId, key);
      const expires = now() + expiresInSeconds * 1000;
      const signature = sign(`${objectKey}\n${expires}`, signingSecret);
      const params = new URLSearchParams({ key: objectKey, expires: String(expires), signature });
      return { url: `/api/objects/download?${params}`, expiresAt: new Date(expires).toISOString() };
    },
    async readSignedUrl(url: string) {
      const parsed = new URL(url, "http://local-object-store");
      if (parsed.pathname !== "/api/objects/download") throw new Error("Invalid signed URL");
      const objectKey = parsed.searchParams.get("key") || "";
      const expires = Number(parsed.searchParams.get("expires"));
      const signature = parsed.searchParams.get("signature") || "";
      if (!Number.isFinite(expires) || now() > expires) throw new Error("Signed URL expired");
      const expected = sign(`${objectKey}\n${expires}`, signingSecret);
      if (!safeSignatureEqual(signature, expected)) throw new Error("Invalid signed URL signature");
      const match = objectKey.match(/^users\/(\d+)\/(.+)$/u);
      if (!match) throw new Error("Invalid signed object key");
      return this.get({ userId: Number(match[1]), key: match[2] });
    },
  };
}

export function createObjectStoreFromEnv(env: any = process.env, { root = process.cwd() } = {}) {
  const driver = String(env.OBJECT_STORE_DRIVER || "local").toLowerCase();
  if (driver === "s3" || driver === "r2" || driver === "minio") {
    return createS3ObjectStore({
      bucket: env.OBJECT_STORE_BUCKET,
      endpoint: env.OBJECT_STORE_ENDPOINT || undefined,
      publicEndpoint: env.OBJECT_STORE_PUBLIC_ENDPOINT || undefined,
      region: env.OBJECT_STORE_REGION || "auto",
      forcePathStyle: driver === "minio" || env.OBJECT_STORE_FORCE_PATH_STYLE === "true",
      credentials: env.OBJECT_STORE_ACCESS_KEY_ID
        ? { accessKeyId: env.OBJECT_STORE_ACCESS_KEY_ID, secretAccessKey: env.OBJECT_STORE_SECRET_ACCESS_KEY }
        : undefined,
    });
  }
  const signingSecret = String(env.OBJECT_STORE_SIGNING_SECRET || "");
  if (env.NODE_ENV === "production" && !signingSecret) {
    throw new Error("OBJECT_STORE_SIGNING_SECRET is required for local object storage in production.");
  }
  return createLocalObjectStore({
    root: env.OBJECT_STORE_LOCAL_PATH || join(root, "storage"),
    signingSecret: signingSecret || "development-object-signing-secret",
  });
}

export function createS3ObjectStore({ bucket, client, signingClient, endpoint, publicEndpoint, region = "auto", credentials, forcePathStyle = false }: any): ObjectStore {
  const s3 = client || new S3Client({ region, ...(endpoint ? { endpoint } : {}), ...(credentials ? { credentials } : {}), forcePathStyle });
  const signer = signingClient || (publicEndpoint ? new S3Client({ region, endpoint: publicEndpoint, ...(credentials ? { credentials } : {}), forcePathStyle }) : s3);
  if (!bucket) throw new Error("Object store bucket is required.");
  return {
    async put({ userId, key, body, contentType = "application/octet-stream", expiresAt = null }: any) {
      const objectKey = userObjectKey(userId, key);
      const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body);
      await s3.send(new PutObjectCommand({ Bucket: bucket, Key: objectKey, Body: buffer, ContentType: contentType, Metadata: { userId: String(userId), contentHash: sha256(buffer), ...(expiresAt ? { expiresAt } : {}) } }));
      return { objectKey, contentType, contentLength: buffer.length, contentHash: sha256(buffer), expiresAt };
    },
    async get({ userId, key }: any) {
      const objectKey = userObjectKey(userId, key);
      try {
        const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: objectKey }));
        return { objectKey, contentType: response.ContentType, contentLength: response.ContentLength, body: Buffer.from(await response.Body!.transformToByteArray()), metadata: response.Metadata || {} };
      } catch (error: any) {
        if (["NoSuchKey", "NotFound"].includes(error?.name)) throw new Error("Object not found");
        throw error;
      }
    },
    async delete({ userId, key }: any) { await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: userObjectKey(userId, key) })); },
    async getSignedDownloadUrl({ userId, key, expiresInSeconds = 300 }: any) {
      validateExpiry(expiresInSeconds);
      const objectKey = userObjectKey(userId, key);
      await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: objectKey }));
      const url = await getSignedUrl(signer, new GetObjectCommand({ Bucket: bucket, Key: objectKey }), { expiresIn: expiresInSeconds });
      return { url, expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString() };
    },
  };
}

export function userObjectKey(userId: unknown, key: unknown) {
  const normalizedUserId = Number(userId);
  const normalizedKey = String(key || "").replace(/\\/gu, "/").replace(/^\/+|\/+$/gu, "");
  if (!Number.isInteger(normalizedUserId) || normalizedUserId <= 0 || !normalizedKey || normalizedKey.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("Invalid object key");
  }
  return `users/${normalizedUserId}/${normalizedKey}`;
}

function resolveLocalPath(root: string, objectKey: string) { const path = resolve(root, ...objectKey.split("/")); if (path !== root && !path.startsWith(`${root}${sep}`)) throw new Error("Invalid object key"); return path; }
function sign(value: string, secret: string) { return createHmac("sha256", secret).update(value).digest("base64url"); }
function sha256(value: Buffer) { return createHash("sha256").update(value).digest("hex"); }
function safeSignatureEqual(left: string, right: string) { const a = Buffer.from(left); const b = Buffer.from(right); return a.length === b.length && timingSafeEqual(a, b); }
function validateExpiry(seconds: number) { if (!Number.isInteger(seconds) || seconds < 1 || seconds > 3600) throw new Error("Signed URL expiry must be between 1 and 3600 seconds."); }
function ignoreMissing(error: any) { if (error?.code !== "ENOENT") throw error; }
