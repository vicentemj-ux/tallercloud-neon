import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"

const accountId = process.env.R2_ACCOUNT_ID
const accessKeyId = process.env.R2_ACCESS_KEY_ID
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
const bucket = process.env.R2_BUCKET
const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL
const DEFAULT_BUCKET = "tallercloud-v1-3"

function assertR2Env() {
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error("R2 env vars are incomplete")
  }
}

function getClient() {
  assertR2Env()
  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: accessKeyId!,
      secretAccessKey: secretAccessKey!,
    },
  })
}

export async function uploadFileToR2(params: {
  key: string
  body: Buffer | Uint8Array | string
  contentType?: string
}) {
  const client = getClient()
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
    }),
  )

  return {
    key: params.key,
    url: getPublicUrl(params.key),
  }
}

export async function deleteFromR2(key: string) {
  const client = getClient()
  await client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  )
}

export function getPublicUrl(key: string) {
  const cleanKey = key.replace(/^\/+/, "")
  if (!publicBaseUrl) return cleanKey
  return `${publicBaseUrl.replace(/\/$/, "")}/${cleanKey}`
}

export function sanitizeFileName(fileName: string) {
  const trimmed = fileName.trim().toLowerCase()
  const base = trimmed
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
  return base || "foto.webp"
}

export function getPublicTrackPhotoKey(params: {
  tenantId: string
  reparacionId: string
  archivoId: string
  fileName: string
}) {
  const safe = sanitizeFileName(params.fileName)
  return `repairs/intake/${params.tenantId}/${params.reparacionId}/${params.archivoId}-${safe}`
}

export function getPrivateRepairPhotoKey(params: {
  tenantId: string
  reparacionId: string
  archivoId: string
  fileName: string
}) {
  const safe = sanitizeFileName(params.fileName)
  return `private/repairs/${params.tenantId}/${params.reparacionId}/${params.archivoId}-${safe}`
}

export function getR2PublicUrl(storageKey: string) {
  const cleanKey = storageKey.replace(/^\/+/, "")
  if (!publicBaseUrl) return cleanKey
  return `${publicBaseUrl.replace(/\/$/, "")}/${cleanKey}`
}

export function getR2BucketName() {
  return bucket || DEFAULT_BUCKET
}
