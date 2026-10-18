import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises'
import path from 'node:path'
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3'
import { Storage } from '@google-cloud/storage'
import { config } from './config.js'
export type StoredObject = {
  provider: string
  bucket: string | null
  objectKey: string
}
export function storageLocation(ownerId: string, id: string): StoredObject {
  const provider = process.env.STORAGE_PROVIDER || 'local'
  if (!['local', 's3', 'r2', 'gcs'].includes(provider))
    throw new Error('Invalid STORAGE_PROVIDER')
  const bucket =
    provider === 'local'
      ? null
      : process.env[`${provider.toUpperCase()}_BUCKET`]
  if (provider !== 'local' && !bucket)
    throw new Error(`Missing ${provider.toUpperCase()}_BUCKET`)
  return {
    provider,
    bucket: bucket || null,
    objectKey: `${encodeURIComponent(ownerId)}/${id}`,
  }
}
function s3(provider: string) {
  if (provider === 'r2') {
    if (
      !process.env.R2_ACCOUNT_ID ||
      !process.env.R2_ACCESS_KEY_ID ||
      !process.env.R2_SECRET_ACCESS_KEY
    )
      throw new Error('R2 credentials are not configured')
    return new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    })
  }
  return new S3Client({ region: process.env.AWS_REGION || 'us-east-1' })
}
function localPath(key: string) {
  const root = path.resolve(config.STORAGE_PATH)
  const result = path.resolve(root, key)
  if (!result.startsWith(root + path.sep))
    throw new Error('Invalid storage key')
  return result
}
export async function putObject(ref: StoredObject, data: Buffer, mime: string) {
  if (ref.provider === 'local') {
    const file = localPath(ref.objectKey)
    await mkdir(path.dirname(file), { recursive: true, mode: 0o700 })
    await writeFile(file, data, { mode: 0o600, flag: 'wx' })
    return
  }
  if (ref.provider === 'gcs') {
    await new Storage()
      .bucket(ref.bucket!)
      .file(ref.objectKey)
      .save(data, {
        resumable: false,
        contentType: mime,
        metadata: { cacheControl: 'private, no-store' },
      })
    return
  }
  await s3(ref.provider).send(
    new PutObjectCommand({
      Bucket: ref.bucket!,
      Key: ref.objectKey,
      Body: data,
      ContentType: mime,
      CacheControl: 'private, no-store',
      ...(ref.provider === 's3'
        ? { ServerSideEncryption: 'AES256' as const }
        : {}),
    }),
  )
}
export async function getObject(ref: StoredObject): Promise<Buffer> {
  if (ref.provider === 'local') return readFile(localPath(ref.objectKey))
  if (ref.provider === 'gcs')
    return (
      await new Storage().bucket(ref.bucket!).file(ref.objectKey).download()
    )[0]
  const result = await s3(ref.provider).send(
    new GetObjectCommand({ Bucket: ref.bucket!, Key: ref.objectKey }),
  )
  return Buffer.from(await result.Body!.transformToByteArray())
}
export async function deleteObject(ref: StoredObject) {
  if (ref.provider === 'local') {
    await unlink(localPath(ref.objectKey)).catch((e: NodeJS.ErrnoException) => {
      if (e.code !== 'ENOENT') throw e
    })
    return
  }
  if (ref.provider === 'gcs') {
    await new Storage()
      .bucket(ref.bucket!)
      .file(ref.objectKey)
      .delete({ ignoreNotFound: true })
    return
  }
  await s3(ref.provider).send(
    new DeleteObjectCommand({ Bucket: ref.bucket!, Key: ref.objectKey }),
  )
}
