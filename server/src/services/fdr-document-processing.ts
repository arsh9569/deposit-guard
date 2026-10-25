import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { inflateSync } from 'node:zlib';

export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;
export type ApprovedMime = 'application/pdf' | 'image/jpeg' | 'image/png';
export interface ExtractionValue { value: string; confidence: number; sourceText?: string }
export type ExtractedFdrValues = Partial<Record<'reference' | 'bankName' | 'principalAmount' | 'issueDate' | 'maturityDate', ExtractionValue>>;
export const supportedExtractedFdrFields = ['reference', 'bankName', 'principalAmount', 'issueDate', 'maturityDate'] as const;
export interface DocumentExtractor {
  extractPdfText(bytes: Buffer): Promise<{ text: string; fields: ExtractedFdrValues }>;
  runOcr(bytes: Buffer, mime: ApprovedMime): Promise<ExtractedFdrValues>;
  runOcrWithText?(bytes: Buffer, mime: ApprovedMime): Promise<{ text: string; fields: ExtractedFdrValues }>;
}
export function compareExtractedValues(extracted: ExtractedFdrValues, submitted: Record<string, string>) {
  return Object.entries(extracted).filter(([key, value]) => submitted[key] !== undefined && normalizeField(key, submitted[key]!) !== normalizeField(key, value!.value)).map(([key]) => key);
}
export function findMissingExtractedFields(extracted: ExtractedFdrValues) {
  return supportedExtractedFdrFields.filter((field) => !extracted[field]?.value.trim());
}
export function privateDocumentFilter(documentId: string, institutionId: string) {
  return { _id: documentId, institutionId, retentionState: 'active' as const, malwareScanStatus: 'clean' as const };
}
export function isRealIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function sanitizeOriginalFileName(value: string) {
  return value.replace(/[\\/\r\n\0]/g, '_').slice(0, 255) || 'fdr-document';
}
function normalize(value: string) { return value.replace(/[,\s]/g, '').toLowerCase(); }
function normalizeField(field: string, value: string) {
  const date = value.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (field.endsWith('Date') && date) return `${date[3]}-${date[2]}-${date[1]}`;
  return normalize(value);
}
export const noProviderExtractor: DocumentExtractor = {
  async extractPdfText(bytes) {
    // Extract text operators from ordinary and Flate-compressed PDF content streams.
    const source = bytes.toString('latin1');
    const streams: string[] = [];
    let totalStreamChars = 0;
    const streamPattern = /<<(.*?)>>\s*stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let streamMatch: RegExpExecArray | null;
    while (totalStreamChars < 20 * 1024 * 1024 && (streamMatch = streamPattern.exec(source))) {
      const dictionary = streamMatch[1] ?? '';
      const data = Buffer.from(streamMatch[2] ?? '', 'latin1');
      try {
        const textStream = (dictionary.includes('/FlateDecode') ? inflateSync(data, { maxOutputLength: 5 * 1024 * 1024 }) : data).toString('latin1');
        streams.push(textStream);
        totalStreamChars += textStream.length;
      } catch {
        // Ignore non-content or unsupported compressed streams and continue with other streams.
      }
    }
    const content = streams.length ? streams.join('\n') : source;
    const text = extractPdfTextOperators(content);
    return { text, fields: parseFdrText(text) };
  },
  async runOcr() { throw new Error('OCR provider is not configured'); },
};

function decodePdfLiteral(value: string) {
  let decoded = '';
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]!;
    if (char !== '\\') { decoded += char; continue; }
    const next = value[++index];
    if (next === undefined) break;
    if (/[0-7]/.test(next)) {
      let octal = next;
      while (octal.length < 3 && /[0-7]/.test(value[index + 1] ?? '')) octal += value[++index];
      decoded += String.fromCharCode(Number.parseInt(octal, 8));
    } else if (next === 'n') decoded += '\n';
    else if (next === 'r') decoded += '\r';
    else if (next === 't') decoded += '\t';
    else if (next === 'b') decoded += '\b';
    else if (next === 'f') decoded += '\f';
    else if (next === '\r' && value[index + 1] === '\n') index += 1;
    else if (next !== '\r' && next !== '\n') decoded += next;
  }
  return decoded;
}

function decodePdfHex(value: string) {
  const hex = value.replace(/\s/g, '').replace(/>$/, '');
  const evenHex = hex.length % 2 ? `${hex}0` : hex;
  const bytes = Buffer.from(evenHex, 'hex');
  if (bytes.length >= 2 && bytes.length % 2 === 0 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    const unicode = bytes.subarray(2);
    return Buffer.from(unicode).swap16().toString('utf16le');
  }
  return bytes.toString('latin1');
}

function extractPdfTextOperators(content: string) {
  const lines: string[] = [];
  const textOperators = /\(((?:\\.|[^\\)]){1,4000})\)|<([0-9a-f\s]{2,8000})>\s*(?:Tj|')|\[((?:\\.|[^\]]){1,12000})\]\s*TJ/gi;
  let match: RegExpExecArray | null;
  while ((match = textOperators.exec(content))) {
    if (match[1] !== undefined) {
      // Literal strings are followed by Tj or a quote operator; ignore other parenthesized text.
      const afterString = content.slice(textOperators.lastIndex, textOperators.lastIndex + 8);
      if (/^\s*(?:Tj|')/.test(afterString)) lines.push(decodePdfLiteral(match[1]));
    } else if (match[2] !== undefined) lines.push(decodePdfHex(match[2]));
    else if (match[3] !== undefined) {
      const strings = /\(((?:\\.|[^\\)]){1,4000})\)|<([0-9a-f\s]{2,8000})>/gi;
      let stringMatch: RegExpExecArray | null;
      while ((stringMatch = strings.exec(match[3]))) lines.push(stringMatch[1] !== undefined ? decodePdfLiteral(stringMatch[1]) : decodePdfHex(stringMatch[2]!));
    }
  }
  return lines.join('\n').slice(0, 200_000);
}

export function parseFdrText(text: string, confidence = 0.75): ExtractedFdrValues {
  const fields: ExtractedFdrValues = {};
  const patterns: Array<[keyof ExtractedFdrValues, RegExp]> = [
    ['reference', /(?:FDR[ \t]*(?:No\.?|Reference)|Reference)[ \t]*[:#-]?[ \t]*([A-Z0-9/-]{3,80})/i],
    ['bankName', /(?:Bank[ \t]*Name|Bank)[ \t]*[:#-]?[ \t]*([A-Z][\w &.-]{2,150})/i],
    ['principalAmount', /(?:Principal[ \t]*Amount|Amount)[ \t]*[:#-]?[ \t]*(?:INR|Rs\.?|₹)?[ \t]*([\d,]+(?:\.\d{1,2})?)/i],
    ['issueDate', /(?:Issue[ \t]*Date|Date[ \t]*of[ \t]*Issue)[ \t]*[:#-]?[ \t]*(\d{4}-\d{2}-\d{2}|\d{2}[/-]\d{2}[/-]\d{4})/i],
    ['maturityDate', /(?:Maturity[ \t]*Date|Date[ \t]*of[ \t]*Maturity)[ \t]*[:#-]?[ \t]*(\d{4}-\d{2}-\d{2}|\d{2}[/-]\d{2}[/-]\d{4})/i],
  ];
  for (const [name, pattern] of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) fields[name] = { value: match[1].trim(), confidence, sourceText: match[0] };
  }
  return fields;
}

export function inspectDocument(bytes: Buffer, declared: string): ApprovedMime {
  if (!bytes.length || bytes.length > MAX_DOCUMENT_BYTES) throw new Error('invalid_size');
  let actual: ApprovedMime | undefined;
  if (bytes.subarray(0, 5).toString('ascii') === '%PDF-') actual = 'application/pdf';
  else if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    if (!isStructurallyValidJpeg(bytes)) throw new Error('malformed_file');
    actual = 'image/jpeg';
  }
  else if (bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    if (!isStructurallyValidPng(bytes)) throw new Error('malformed_file');
    actual = 'image/png';
  }
  if (!actual || actual !== declared) throw new Error('invalid_file_content');
  if (actual === 'application/pdf' && !bytes.includes(Buffer.from('%%EOF'))) throw new Error('malformed_file');
  return actual;
}

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
function crc32(bytes: Buffer) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function isStructurallyValidPng(bytes: Buffer) {
  let offset = PNG_SIGNATURE.length;
  let sawHeader = false;
  let sawImageData = false;
  let imageDataBytes = 0;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const chunkEnd = offset + 12 + length;
    if (chunkEnd > bytes.length) return false;
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const crcInput = bytes.subarray(offset + 4, offset + 8 + length);
    if (bytes.readUInt32BE(offset + 8 + length) !== crc32(crcInput)) return false;
    if (!sawHeader) {
      if (type !== 'IHDR' || length !== 13) return false;
      const width = bytes.readUInt32BE(offset + 8);
      const height = bytes.readUInt32BE(offset + 12);
      if (width === 0 || height === 0 || width > 12_000 || height > 12_000 || width * height > 40_000_000) return false;
      sawHeader = true;
    } else if (type === 'IHDR') return false;
    if (type === 'IDAT') { sawImageData = true; imageDataBytes += length; }
    if (type === 'IEND') return length === 0 && sawImageData && imageDataBytes > 0 && chunkEnd === bytes.length;
    const firstByte = type.charCodeAt(0);
    const isCritical = firstByte >= 65 && firstByte <= 90;
    if (isCritical && !['IHDR', 'PLTE', 'IDAT'].includes(type)) return false;
    offset = chunkEnd;
  }
  return false;
}
function isStructurallyValidJpeg(bytes: Buffer) {
  if (bytes.length < 12 || bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) return false;
  let offset = 2;
  let sawFrame = false;
  while (offset < bytes.length - 2) {
    if (bytes[offset] !== 0xff) return false;
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if (marker === undefined || marker === 0x00 || marker === 0xd9) return false;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length - 2) return false;
    const segmentLength = bytes.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length - 2) return false;
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      if (segmentLength < 8) return false;
      const height = bytes.readUInt16BE(offset + 3);
      const width = bytes.readUInt16BE(offset + 5);
      if (width === 0 || height === 0 || width > 12_000 || height > 12_000 || width * height > 40_000_000) return false;
      sawFrame = true;
    }
    offset += segmentLength;
    if (marker === 0xda) return sawFrame && offset < bytes.length - 2;
  }
  return false;
}

export async function storePrivateDocument(bytes: Buffer): Promise<{ storageKey: string; sha256: string }> {
  const storageKey = `${randomUUID()}.blob`;
  const root = path.resolve(process.env.DOCUMENT_STORAGE_DIR ?? path.join(process.cwd(), '.private-documents'));
  await mkdir(root, { recursive: true, mode: 0o700 });
  await writeFile(path.join(root, storageKey), bytes, { flag: 'wx', mode: 0o600 });
  return { storageKey, sha256: createHash('sha256').update(bytes).digest('hex') };
}
