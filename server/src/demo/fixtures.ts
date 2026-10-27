/** Build a deterministic, structurally valid one-page PDF fixture for the seeded walkthrough. */
export function createDemoFdrPdf(reference: string, amount: string, maturity: string, bankName = 'Synthetic National Bank'): Buffer {
  const lines = ['SYNTHETIC DEMO ONLY - NOT A FINANCIAL DOCUMENT', `FDR Reference: ${reference}`, `Bank Name: ${bankName}`, `Principal Amount: INR ${amount}`, 'Issue Date: 2026-01-01', `Maturity Date: ${maturity}`];
  const stream = `BT /F1 12 Tf 50 740 Td 16 TL ${lines.map((line, index) => `${index ? 'T* ' : ''}(${line}) Tj`).join(' ')} ET`;
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`];
  let pdf = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf); pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'ascii');
}
