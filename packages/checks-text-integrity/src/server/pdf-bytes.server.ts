/**
 * Returns a standalone copy of PDF bytes for hashing and storage writes.
 * Use Uint8Array (not Buffer.slice) so the backing ArrayBuffer matches byteLength.
 */
export function boundedPdfBytes(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(bytes);
}

export function isPdfBytes(bytes: Uint8Array): boolean {
  return (
    bytes.byteLength >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  );
}
