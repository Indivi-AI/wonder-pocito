import { Writable } from 'node:stream'
import { CopyObjectCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

let storageApi
const env = process.env
const endpoint = name => (env[name] || env.MINIO_ENDPOINT).replace(/\/$/, '')
const s3Client = endpoint => new S3Client({ endpoint, region: env.MINIO_REGION || 'us-east-1', forcePathStyle: true,
  credentials: { accessKeyId: env.MINIO_ACCESS_KEY, secretAccessKey: env.MINIO_SECRET_KEY } })
const errorCode = e => Object.assign(e, { code: e.$metadata?.httpStatusCode || e.code })
const send = (s3, command) => s3.send(command).catch(e => { throw errorCode(e) })
const buffer = async body => Buffer.from(await body.transformToByteArray())
const copySource = (bucket, key) => `/${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`

export function s3Storage() {
  if (storageApi) return storageApi
  const s3 = s3Client(endpoint('MINIO_ENDPOINT')), publicS3 = s3Client(endpoint('MINIO_PUBLIC_ENDPOINT'))
  const file = (bucket, name) => ({
    name,
    async getMetadata() {
      const x = await send(s3, new HeadObjectCommand({ Bucket: bucket, Key: name }))
      return [{ updated: x.LastModified?.toISOString(), size: x.ContentLength, generation: x.ETag, metadata: x.Metadata }]
    },
    async download() { return [await buffer((await send(s3, new GetObjectCommand({ Bucket: bucket, Key: name }))).Body)] },
    async save(body, opts = {}) {
      const match = opts.preconditionOpts?.ifGenerationMatch
      return send(s3, new PutObjectCommand({ Bucket: bucket, Key: name, Body: body, ContentType: opts.contentType,
        Metadata: opts.metadata?.metadata || opts.metadata, ...(match != null && (match ? { IfMatch: String(match) } : { IfNoneMatch: '*' })) }))
    },
    createWriteStream(opts) {
      const chunks = []
      return new Writable({ write: (chunk, _, done) => { chunks.push(Buffer.from(chunk)); done() },
        final: done => file(bucket, name).save(Buffer.concat(chunks), opts).then(() => done(), done) })
    },
    async setMetadata(metadata, opts = {}) {
      const match = opts.preconditionOpts?.ifGenerationMatch
      return send(s3, new CopyObjectCommand({ Bucket: bucket, Key: name, CopySource: copySource(bucket, name), MetadataDirective: 'REPLACE',
        Metadata: metadata.metadata || metadata, ...(match && { CopySourceIfMatch: String(match) }) }))
    },
    async getSignedUrl({ action, expires, contentType }) {
      const Command = action === 'read' ? GetObjectCommand : PutObjectCommand
      return [await getSignedUrl(publicS3, new Command({ Bucket: bucket, Key: name, ...(contentType && { ContentType: contentType }) }),
        { expiresIn: Math.floor((expires - Date.now()) / 1000) })]
    }
  })
  const bucket = name => ({
    file: key => file(name, key),
    async getFiles({ prefix = '', delimiter, autoPaginate = true, maxResults = 1000, pageToken } = {}) {
      const files = [], prefixes = [], items = []
      let token = pageToken
      do {
        const x = await send(s3, new ListObjectsV2Command({ Bucket: name, Prefix: prefix, Delimiter: delimiter,
          MaxKeys: maxResults, ContinuationToken: token }))
        files.push(...(x.Contents || []).map(x => file(name, x.Key)))
        items.push(...(x.Contents || []).map(x => ({ name: x.Key, updated: x.LastModified?.toISOString(), size: String(x.Size) })))
        prefixes.push(...(x.CommonPrefixes || []).map(x => x.Prefix))
        token = x.NextContinuationToken
      } while (autoPaginate && token)
      return [files, token ? { pageToken: token } : null, { data: { prefixes, items } }]
    }
  })
  return storageApi = { bucket }
}
