# Private document storage

Select one default with `STORAGE_PROVIDER=local|s3|gcs|r2`. The API validates the file signature and size, then stores bytes through the provider SDK. Buckets must remain private; downloads pass through the authenticated API. Browser CORS rules and public bucket access are unnecessary. No document bytes, session secrets, or cloud credentials belong in Redis events or logs.

Each PostgreSQL file row stores its provider, bucket, object key, MIME type, SHA-256 digest, owner and optional collection session. Changing the default affects new uploads; retain credentials for any providers containing older files. This is not an automatic bucket-to-bucket migration.

## AWS S3

```dotenv
STORAGE_PROVIDER=s3
S3_BUCKET=your-private-bucket
AWS_REGION=us-east-1
```

Use an IAM role in production or set `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` (and `AWS_SESSION_TOKEN` for temporary credentials). Grant `s3:PutObject`, `s3:GetObject`, and `s3:DeleteObject` on the bucket's objects. Keep Block Public Access enabled. Uploads request SSE-S3 encryption. Standard SDK credential resolution supports instance/container roles.

## Google Cloud Storage

```dotenv
STORAGE_PROVIDER=gcs
GCS_BUCKET=your-private-bucket
GOOGLE_CLOUD_PROJECT=your-project
GOOGLE_APPLICATION_CREDENTIALS=/run/secrets/gcs.json
```

Prefer workload identity / Application Default Credentials. If using a JSON service account key on a generic server, mount it read-only at the configured path; never bake it into the image. Example Compose override:

```yaml
services:
  app:
    volumes:
      - /secure/location/gcs.json:/run/secrets/gcs.json:ro
```

Grant the service account Storage Object User on the chosen bucket, enable uniform bucket-level access, and enforce public access prevention.

## Cloudflare R2

```dotenv
STORAGE_PROVIDER=r2
R2_ACCOUNT_ID=your-account-id
R2_BUCKET=your-private-bucket
R2_ACCESS_KEY_ID=your-r2-access-key
R2_SECRET_ACCESS_KEY=your-r2-secret
```

Create an R2 API token scoped to Object Read & Write on this bucket. The adapter uses the S3-compatible endpoint `https://<account-id>.r2.cloudflarestorage.com` with region `auto`. Disable public bucket access. Cloudflare API tokens for general account management are not S3 access keys.

## Local storage

`STORAGE_PROVIDER=local` uses the `document-data` Docker volume. Files are written with restricted permissions under tenant-specific paths. Back up this volume together with PostgreSQL. Protect host disks using encryption and the access controls appropriate to your deployment.

Documents are collected without OCR or malware scanning in this phase. Downloads use attachment disposition and `nosniff`; operating a scanning pipeline is separate from file-signature validation.

## Provider references

- [AWS SDK for JavaScript S3 examples](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/javascript_s3_code_examples.html)
- [Google Cloud Storage uploads](https://docs.cloud.google.com/storage/docs/uploading-objects-from-memory)
- [Cloudflare R2 with AWS SDK v3](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/)
