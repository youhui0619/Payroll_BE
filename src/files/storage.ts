import { Injectable } from '@nestjs/common';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
export interface StorageProvider {
  put(key: string, bytes: Buffer, mime: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}
@Injectable()
export class Storage implements StorageProvider {
  private readonly root = resolve(process.env.STORAGE_LOCAL_PATH ?? 'storage');
  private readonly s3 =
    process.env.STORAGE_PROVIDER === 's3'
      ? new S3Client({
          region: process.env.AWS_REGION ?? 'ap-southeast-1',
          endpoint: process.env.S3_ENDPOINT || undefined,
          forcePathStyle: !!process.env.S3_ENDPOINT,
        })
      : null;
  private key(key: string) {
    if (!/^[a-f0-9-]{36}$/.test(key)) throw new Error('Invalid storage key');
    return key;
  }
  async put(key: string, bytes: Buffer, mime: string) {
    key = this.key(key);
    if (this.s3) {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket(),
          Key: key,
          Body: bytes,
          ContentType: mime,
        }),
      );
      return;
    }
    await mkdir(this.root, { recursive: true });
    await writeFile(resolve(this.root, key), bytes, { flag: 'wx' });
  }
  async get(key: string) {
    key = this.key(key);
    if (this.s3) {
      const data = await this.s3.send(
        new GetObjectCommand({ Bucket: this.bucket(), Key: key }),
      );
      return Buffer.from(await data.Body.transformToByteArray());
    }
    return readFile(resolve(this.root, key));
  }
  async remove(key: string) {
    key = this.key(key);
    if (this.s3) {
      await this.s3.send(
        new DeleteObjectCommand({ Bucket: this.bucket(), Key: key }),
      );
      return;
    }
    await unlink(resolve(this.root, key));
  }
  private bucket() {
    if (!process.env.S3_BUCKET) throw new Error('Set S3_BUCKET');
    return process.env.S3_BUCKET;
  }
}
