export function sniff(bytes: Buffer) {
  if (bytes.subarray(0, 5).toString() === '%PDF-') return 'application/pdf';
  if (
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    return 'image/jpeg';
  return null;
}
