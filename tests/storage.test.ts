import { beforeAll, afterEach, expect, test, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  save: vi.fn(),
  download: vi.fn(),
  remove: vi.fn(),
  s3: vi.fn(),
  bucket: vi.fn(),
}))
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class {
    constructor(options: unknown) {
      mocks.s3(options)
    }
    send = mocks.send
  },
  PutObjectCommand: class {
    constructor(public input: unknown) {}
  },
  GetObjectCommand: class {
    constructor(public input: unknown) {}
  },
  DeleteObjectCommand: class {
    constructor(public input: unknown) {}
  },
}))
vi.mock('@google-cloud/storage', () => ({
  Storage: class {
    bucket(name: string) {
      mocks.bucket(name)
      return {
        file: () => ({
          save: mocks.save,
          download: mocks.download,
          delete: mocks.remove,
        }),
      }
    }
  },
}))
let storage: typeof import('../server/storage'), root: string
beforeAll(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'openkyc-'))
  Object.assign(process.env, {
    DATABASE_URL: 'postgres://unused',
    REDIS_URL: 'redis://unused',
    BETTER_AUTH_SECRET: 'x'.repeat(32),
    STORAGE_PATH: root,
  })
  storage = await import('../server/storage')
})
afterEach(() => vi.clearAllMocks())
test('local PDF bytes survive a round trip and deletion', async () => {
  const ref = { provider: 'local', bucket: null, objectKey: 'tenant/document' }
  const data = Buffer.from('%PDF-1.4 test')
  await storage.putObject(ref, data, 'application/pdf')
  expect(await storage.getObject(ref)).toEqual(data)
  await storage.deleteObject(ref)
  await expect(storage.getObject(ref)).rejects.toThrow()
  await rm(root, { recursive: true, force: true })
})
test('local path traversal is rejected', async () => {
  await expect(
    storage.getObject({
      provider: 'local',
      bucket: null,
      objectKey: '../../etc/passwd',
    }),
  ).rejects.toThrow('Invalid storage key')
})
test('S3 writes preserve MIME type, privacy and encryption metadata', async () => {
  await storage.putObject(
    { provider: 's3', bucket: 'private-docs', objectKey: 'tenant/id' },
    Buffer.from('pdf'),
    'application/pdf',
  )
  expect(mocks.send.mock.calls[0][0].input).toMatchObject({
    Bucket: 'private-docs',
    Key: 'tenant/id',
    ContentType: 'application/pdf',
    CacheControl: 'private, no-store',
    ServerSideEncryption: 'AES256',
  })
  expect(mocks.send.mock.calls[0][0].input).not.toHaveProperty('ACL')
})
test('R2 uses Cloudflare endpoint, auto region and separate credentials', async () => {
  Object.assign(process.env, {
    R2_ACCOUNT_ID: 'test-account',
    R2_ACCESS_KEY_ID: 'id',
    R2_SECRET_ACCESS_KEY: 'secret',
  })
  await storage.putObject(
    { provider: 'r2', bucket: 'r2-docs', objectKey: 'tenant/id' },
    Buffer.from('pdf'),
    'application/pdf',
  )
  expect(mocks.s3).toHaveBeenCalledWith(
    expect.objectContaining({
      region: 'auto',
      endpoint: 'https://test-account.r2.cloudflarestorage.com',
    }),
  )
  expect(mocks.send.mock.calls[0][0].input).not.toHaveProperty(
    'ServerSideEncryption',
  )
})
test('GCS saves content type and reads bytes through ADC', async () => {
  const ref = { provider: 'gcs', bucket: 'gcs-docs', objectKey: 'tenant/id' }
  await storage.putObject(ref, Buffer.from('pdf'), 'application/pdf')
  expect(mocks.bucket).toHaveBeenCalledWith('gcs-docs')
  expect(mocks.save).toHaveBeenCalledWith(
    Buffer.from('pdf'),
    expect.objectContaining({ contentType: 'application/pdf' }),
  )
  mocks.download.mockResolvedValue([Buffer.from('pdf')])
  expect(await storage.getObject(ref)).toEqual(Buffer.from('pdf'))
  await storage.deleteObject(ref)
  expect(mocks.remove).toHaveBeenCalled()
})
test('recorded provider remains authoritative after changing default', async () => {
  process.env.STORAGE_PROVIDER = 'gcs'
  mocks.send.mockResolvedValue({
    Body: { transformToByteArray: async () => Buffer.from('old') },
  })
  expect(
    await storage.getObject({
      provider: 's3',
      bucket: 'old-bucket',
      objectKey: 'old/key',
    }),
  ).toEqual(Buffer.from('old'))
  expect(mocks.send.mock.calls[0][0].input).toMatchObject({
    Bucket: 'old-bucket',
  })
})
