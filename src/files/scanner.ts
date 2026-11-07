import { Injectable } from '@nestjs/common';
import { createConnection } from 'node:net';
import { fail } from '../common/domain';
@Injectable()
export class Scanner {
  async scan(bytes: Buffer): Promise<'CLEAN' | 'UNSCANNED'> {
    const host = process.env.CLAMAV_HOST;
    if (!host) {
      if (
        process.env.NODE_ENV !== 'production' &&
        process.env.ALLOW_UNSCANNED_UPLOADS === 'true'
      )
        return 'UNSCANNED';
      fail(
        'SCANNER_REQUIRED',
        'Configure CLAMAV_HOST before uploading files.',
        503,
      );
    }
    const port = Number(process.env.CLAMAV_PORT ?? 3310);
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      fail('SCANNER_UNAVAILABLE', 'Invalid scanner configuration.', 503);
    const result = await new Promise<string>((resolve, reject) => {
      const socket = createConnection({ host, port });
      let answer = '';
      socket.setTimeout(15000, () =>
        socket.destroy(new Error('Scanner timeout')),
      );
      socket.on('error', reject);
      socket.on('connect', () => {
        socket.write(Buffer.from('zINSTREAM\0'));
        for (let start = 0; start < bytes.length; start += 65536) {
          const chunk = bytes.subarray(start, start + 65536);
          const length = Buffer.alloc(4);
          length.writeUInt32BE(chunk.length);
          socket.write(length);
          socket.write(chunk);
        }
        socket.write(Buffer.alloc(4));
      });
      socket.on('data', (chunk) => {
        answer += chunk.toString();
        if (answer.includes('\0')) {
          socket.destroy();
          resolve(answer);
        }
      });
      socket.on('end', () => resolve(answer));
    }).catch(() =>
      fail('SCANNER_UNAVAILABLE', 'File scanner is unavailable.', 503),
    );
    if (result.includes('FOUND'))
      fail('FILE_REJECTED', 'The scanner rejected this file.', 400);
    if (!/^stream: OK\0?$/.test(result))
      fail('SCANNER_UNAVAILABLE', 'Scanner did not confirm a clean file.', 503);
    return 'CLEAN';
  }
}
