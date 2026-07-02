const fs = require('fs');
const path = require('path');

function replaceInFile(filePath) {
  let code = fs.readFileSync(filePath, 'utf-8');
  let originalCode = code;

  // Add import if we are replacing anything
  if (!code.includes('import CurrencyInput') && /<input type="number"/.test(code)) {
    // Basic detection if there's an input we want to replace
    // We will do a manual check or regex.
  }

  // Common patterns for currency in the app
  // <input type="number" ... value={subsidyBarangay} onChange={(e) => setSubsidyBarangay(Number(e.target.value))} />
  code = code.replace(/<input\s+type="number"(?:\s+min="0")?(?:\s+step="0\.01")?\s+value={([^}]+)}\s+onChange={\(e\)\s*=>\s*set([a-zA-Z]+)\(Number\(e\.target\.value\)\)}\s*(?:\/>|>)/g, (match, val, setter) => {
    if (val.toLowerCase().includes('year') || val.toLowerCase().includes('quantity') || val.toLowerCase().includes('month')) return match;
    return `<CurrencyInput value={${val}} onValueChange={(val) => set${setter}(Number(val))} />`;
  });

  // pattern for object update (e.g. ocrData.amount, row.honoraria)
  // onChange={(e) => setOcrData({...ocrData, amount: e.target.value})}
  code = code.replace(/<input\s+type="number"\s+value={([a-zA-Z]+\.amount)}\s+onChange={\(e\)\s*=>\s*set([a-zA-Z]+)\(\{\.\.\.[a-zA-Z]+,\s*amount:\s*e\.target\.value\}\)}\s*\/>/g, (match, val, setter) => {
    return `<CurrencyInput value={${val}} onValueChange={(val) => set${setter}({...${val.split('.')[0]}, amount: Number(val)})} />`;
  });

  // For NewRequestPage row updates
  // onChange={(e) => updatePayrollRow(index, 'honoraria', e.target.value)}
  code = code.replace(/<input\s+type="number"(?:\s+min="0")?(?:\s+step="0\.01")?\s+value={row\.([a-zA-Z]+)}\s+onChange={\(e\)\s*=>\s*([a-zA-Z]+)\(index,\s*'([^']+)',\s*e\.target\.value\)}\s*\/>/g, (match, prop, func, field) => {
    if (prop.toLowerCase().includes('quantity') || prop.toLowerCase().includes('year')) return match;
    return `<CurrencyInput value={row.${prop}} onValueChange={(val) => ${func}(index, '${field}', Number(val))} />`;
  });
  
  // For NewRequestPage updateBreakdownItem
  // onChange={(e) => updateBreakdownItem(index, 'quantity', e.target.value)}
  // skip this if field is quantity, handled by condition above (well, prop is item.quantity)
  code = code.replace(/<input\s+type="number"(?:\s+min="0")?(?:\s+step="0\.01")?\s+value={item\.([a-zA-Z]+)}\s+onChange={\(e\)\s*=>\s*([a-zA-Z]+)\(index,\s*'([^']+)',\s*e\.target\.value\)}\s*\/>/g, (match, prop, func, field) => {
    if (prop.toLowerCase().includes('quantity') || field.toLowerCase().includes('quantity')) return match;
    return `<CurrencyInput value={item.${prop}} onValueChange={(val) => ${func}(index, '${field}', Number(val))} />`;
  });

  // TransmittalLetterForm, DisbursementVoucherForm
  // <input type="number" min="0" step="0.01" value={row.amount} onChange={(e) => updateDvRow(idx, 'amount', e.target.value)} placeholder="0.00" />
  code = code.replace(/<input\s+type="number"(?:\s+min="0")?(?:\s+step="0\.01")?\s+value={row\.([a-zA-Z]+)}\s+onChange={\(e\)\s*=>\s*([a-zA-Z]+)\(([^,]+),\s*'([^']+)',\s*e\.target\.value\)}\s*placeholder="0\.00"\s*\/>/g, (match, prop, func, idx, field) => {
    return `<CurrencyInput value={row.${prop}} onValueChange={(val) => ${func}(${idx}, '${field}', Number(val))} placeholder="0.00" />`;
  });

  // For ExpensesPage
  // <input type="number" ... value={amount} onChange={(event) => setAmount(Number(event.target.value))} />
  // handled by first one, but event instead of e
  code = code.replace(/<input\s+type="number"(?:\s+min="0")?(?:\s+step="0\.01")?\s+value={([^}]+)}\s+onChange={\(event\)\s*=>\s*set([a-zA-Z]+)\(Number\(event\.target\.value\)\)}\s*(?:\/>|>)/g, (match, val, setter) => {
    if (val.toLowerCase().includes('year') || val.toLowerCase().includes('quantity') || val.toLowerCase().includes('month')) return match;
    return `<CurrencyInput value={${val}} onValueChange={(val) => set${setter}(Number(val))} />`;
  });

  if (code !== originalCode) {
    if (!code.includes('import CurrencyInput')) {
      code = code.replace(/(import .*?;?\n)/, "$1import CurrencyInput from '../components/CurrencyInput';\n");
    }
    fs.writeFileSync(filePath, code);
    console.log('Updated ' + filePath);
  }
}

const files = [
  'src/pages/AnnualReportPage.jsx',
  'src/pages/ExpensesPage.jsx',
  'src/pages/NewRequestPage.jsx',
  'src/pages/ReceiptsPage.jsx',
  'src/components/DocumentGenerator.jsx',
  'src/components/documents/DisbursementVoucherForm.jsx',
  'src/components/documents/ItineraryOfTravelForm.jsx',
  'src/components/documents/PayrollForm.jsx',
  'src/components/documents/ProjectDesignForm.jsx',
  'src/components/documents/TransmittalLetterForm.jsx'
];

files.forEach(f => replaceInFile(path.resolve(process.cwd(), f)));
