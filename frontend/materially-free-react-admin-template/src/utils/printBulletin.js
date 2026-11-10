const PRINT_CSS = `
  @page { size: A4; margin: 10mm; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #111; }
  #bulletin-print { max-width: none !important; border: none !important; box-shadow: none !important; }
  table { border-collapse: collapse; }
  th, td { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  img { max-width: 100%; }
`;

export function imprimerBulletin(elementId = 'bulletin-print', title = 'Bulletin') {
  const content = document.getElementById(elementId);
  if (!content) return;
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html><head><title>${title}</title>
    <style>${PRINT_CSS}</style></head>
    <body>${content.outerHTML}</body></html>`);
  w.document.close();
  w.focus();
  w.print();
}
