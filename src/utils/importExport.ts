import * as XLSX from 'xlsx';
import { CategoryKey, ImportRow } from '../types';

export function normalizeImportRow(raw: Record<string, unknown>): ImportRow | null {
  const map: Record<string, unknown> = {};
  Object.keys(raw).forEach((k) => {
    map[String(k).trim().toLowerCase().replace(/[\s_./-]+/g, '')] = raw[k];
  });

  const pick = (...keys: string[]): string | number => {
    for (const k of keys) {
      if (map[k] !== undefined && String(map[k]).trim() !== '') return map[k] as string | number;
    }
    return '';
  };

  const name = String(pick('name', 'product', 'productname', 'item', 'itemname', 'description', 'itemdescription')).trim();
  if (!name) return null;

  const opening = Number(pick('opening', 'openingstock', 'qty', 'quantity', 'cases', 'caseqty', 'billedcases', 'billedqty')) || 0;
  const retail = Number(pick('retail', 'retailprice', 'mrp', 'sellingprice', 'sp', 'retailmrp')) || 0;
  const wholesale = Number(pick('wholesale', 'wholesaleprice', 'dealerprice', 'wp', 'wholesalerate')) || retail;
  const cost = Number(pick('cost', 'costprice', 'purchaseprice', 'rate', 'unitrate', 'unitprice', 'purchaserate')) || 0;
  const volume = Number(pick('volume', 'ml', 'size', 'volumeml')) || 150;
  const pack = String(pick('pack', 'packaging') || 'PET').trim() || 'PET';
  const expiry = String(pick('expiry', 'expirydate', 'exp', 'bestbefore') || '').trim();
  const catRaw = String(pick('category', 'cat', 'brand', 'group') || '').toLowerCase();
  const hsn = String(pick('hsn', 'hsncode', 'sac', 'hsnsac') || '').trim();
  const batchNumber = String(pick('batch', 'batchnumber', 'lot', 'lotnumber') || '').trim().toUpperCase();
  const scheme = String(pick('scheme', 'promoscheme', 'purchasescheme', 'offer', 'schemepromooffer') || '').trim();

  // Invoice provider details
  const supplierName = String(pick('suppliername', 'supplier', 'providername', 'provider', 'vendor', 'distributor') || '').trim();
  const supplierGstin = String(pick('suppliergstin', 'gstin', 'gstno', 'gstnumber', 'providergstin') || '').trim().toUpperCase();
  const supplierAddress = String(pick('supplieraddress', 'address', 'provideraddress', 'godownaddress') || '').trim();
  const supplierPhone = String(pick('supplierphone', 'phone', 'mobile', 'contact', 'providerphone') || '').trim();
  const supplierEmail = String(pick('supplieremail', 'email', 'provideremail') || '').trim();
  const invoiceNo = String(pick('invoiceno', 'invoice', 'billno', 'invoicenumber', 'billnumber', 'quotationno') || '').trim();
  const invoiceDate = String(pick('invoicedate', 'date', 'billdate', 'invoicedt') || '').trim();
  const vehicleNo = String(pick('vehicleno', 'vehicle', 'truckno', 'transport', 'lorryno') || '').trim().toUpperCase();
  const placeOfSupply = String(pick('placeofsupply', 'pos', 'state') || '').trim();
  const billedTo = String(pick('billedto', 'buyer', 'consignee', 'customer') || '').trim();
  const shippedTo = String(pick('shippedto', 'destination', 'godown', 'dispatchto') || '').trim();

  let category: CategoryKey = 'energy';
  if (catRaw.includes('vibe') || catRaw.includes('soda') || catRaw.includes('cola')) category = 'vibe';
  else if (catRaw.includes('joos') || catRaw.includes('juice') || catRaw.includes('sosyo')) category = 'joos';

  const warnings: string[] = [];
  if (!retail) warnings.push('no retail price — will default to wholesale or cost * 1.25');
  if (!opening) warnings.push('no quantity — will add 0 cases');

  return {
    name,
    opening,
    cost,
    retail,
    wholesale,
    volume,
    pack,
    expiry,
    category,
    hsn: hsn || undefined,
    batchNumber: batchNumber || undefined,
    scheme: scheme || undefined,
    supplierName: supplierName || undefined,
    supplierGstin: supplierGstin || undefined,
    supplierAddress: supplierAddress || undefined,
    supplierPhone: supplierPhone || undefined,
    supplierEmail: supplierEmail || undefined,
    invoiceNo: invoiceNo || undefined,
    invoiceDate: invoiceDate || undefined,
    vehicleNo: vehicleNo || undefined,
    placeOfSupply: placeOfSupply || undefined,
    billedTo: billedTo || undefined,
    shippedTo: shippedTo || undefined,
    warnings,
  };
}

export function parseExcelOrCsv(
  fileData: string | ArrayBuffer
): { rows: ImportRow[]; error: string } {
  try {
    const wb = XLSX.read(fileData, { type: typeof fileData === 'string' ? 'binary' : 'array' });
    let sheetName = wb.SheetNames[0];

    // Prefer inward items sheet if multiple sheets exist
    for (const s of wb.SheetNames) {
      if (/item|product|beverage|inward|table/i.test(s)) {
        sheetName = s;
        break;
      }
    }

    if (!sheetName) return { rows: [], error: 'Workbook is empty.' };

    const sheet = wb.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
    const parsed = rawRows.map(normalizeImportRow).filter((r): r is ImportRow => r !== null);

    if (parsed.length === 0) {
      return {
        rows: [],
        error: 'No usable product rows found. Please check that headers include product name/item.',
      };
    }

    return { rows: parsed, error: '' };
  } catch {
    return {
      rows: [],
      error: "Couldn't read that file. Please ensure it is a valid Excel (.xlsx) or CSV file.",
    };
  }
}

/**
 * Downloads standard CSV template capturing invoice provider details + beverage catalog rows
 */
export function downloadImportTemplate(): void {
  const header = [
    'Supplier Name',
    'Supplier GSTIN',
    'Supplier Address',
    'Supplier Phone',
    'Supplier Email',
    'Invoice No',
    'Invoice Date (YYYY-MM-DD)',
    'Vehicle No',
    'Place of Supply',
    'Billed To',
    'Shipped To',
    'Item Description / Name',
    'Category',
    'HSN/SAC',
    'Batch Number',
    'Volume (ml)',
    'Pack',
    'Expiry (YYYY-MM-DD)',
    'Opening Qty (Cases)',
    'Cost / Purchase Rate (₹)',
    'Retail MRP (₹)',
    'Wholesale Rate (₹)',
    'Scheme / Promo Offer',
  ];

  const escapeCsv = (val: string | number) => {
    const s = String(val ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const sample1 = [
    'RADHIKA ENTERPRISES',
    '21FSDPR8480R1ZU',
    'Main Road, Near Bus Stand, Kuchinda, Sambalpur, Odisha - 768222',
    '+91 94370 84801',
    'radhika.beverages@gmail.com',
    '38/26-27',
    '2026-09-12',
    'OD15AF7869',
    'Odisha (21)',
    'NEW BIJAYA PUSTAK BHANDRA',
    'SAHAJBAHAL GODOWN / KUCHINDA DEPOT',
    'CAMPA POWER UP 150ML PET',
    'energy',
    '22021090',
    'LOT-PU15-9481',
    150,
    'PET',
    '2027-03-31',
    150,
    222,
    265,
    245,
    'None',
  ];

  const sample2 = [
    'RADHIKA ENTERPRISES',
    '21FSDPR8480R1ZU',
    'Main Road, Near Bus Stand, Kuchinda, Sambalpur, Odisha - 768222',
    '+91 94370 84801',
    'radhika.beverages@gmail.com',
    '38/26-27',
    '2026-09-12',
    'OD15AF7869',
    'Odisha (21)',
    'NEW BIJAYA PUSTAK BHANDRA',
    'SAHAJBAHAL GODOWN / KUCHINDA DEPOT',
    'E.H. VIBE COLA 150ML',
    'vibe',
    '22021010',
    'LOT-VC15-8821',
    150,
    'PET',
    '2027-03-31',
    60,
    210,
    250,
    230,
    '10+1 Dealer Scheme',
  ];

  const sample3 = [
    'RADHIKA ENTERPRISES',
    '21FSDPR8480R1ZU',
    'Main Road, Near Bus Stand, Kuchinda, Sambalpur, Odisha - 768222',
    '+91 94370 84801',
    'radhika.beverages@gmail.com',
    '38/26-27',
    '2026-09-12',
    'OD15AF7869',
    'Odisha (21)',
    'NEW BIJAYA PUSTAK BHANDRA',
    'SAHAJBAHAL GODOWN / KUCHINDA DEPOT',
    'SOSYO JOOS MANGO 160ML PET',
    'joos',
    '22029920',
    'LOT-JM16-7731',
    160,
    'PET',
    '2027-04-30',
    80,
    200,
    240,
    220,
    '₹15 Off / Case Trade Discount',
  ];

  const csv = [
    header.map(escapeCsv).join(','),
    sample1.map(escapeCsv).join(','),
    sample2.map(escapeCsv).join(','),
    sample3.map(escapeCsv).join(','),
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'Radhika_Beverages_Inward_Template.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Downloads multi-sheet Excel (.xlsx) template capturing dedicated Invoice Provider Details sheet,
 * Inward Items Table sheet, and GST Slabs guide sheet.
 */
export function downloadImportTemplateXlsx(): void {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Invoice Provider Details (Metadata)
  const providerDetailsRows = [
    ['INVOICE PROVIDER & CONSIGNMENT DETAILS', 'CAPTURED VALUE', 'FIELD GUIDELINES'],
    ['Supplier / Provider Name', 'RADHIKA ENTERPRISES', 'Legal trade name of the beverage manufacturer or principal distributor'],
    ['Supplier GSTIN', '21FSDPR8480R1ZU', '15-digit GST Identification Number (Odisha code: 21)'],
    ['Supplier Address', 'Main Road, Near Bus Stand, Kuchinda, Sambalpur, Odisha - 768222', 'Registered billing or dispatch godown address'],
    ['Supplier Phone / Contact', '+91 94370 84801', 'Official dispatch or transport contact number'],
    ['Supplier Email', 'radhika.beverages@gmail.com', 'Billing and accounts confirmation email address'],
    ['Invoice / Bill Number', '38/26-27', 'Tax invoice number, sales quotation, or DC reference number'],
    ['Invoice Date (YYYY-MM-DD)', '2026-09-12', 'Date of tax invoice issue'],
    ['Vehicle / Transport Reg No', 'OD15AF7869', 'Commercial transport carrier or delivery vehicle number'],
    ['Place of Supply (POS)', 'Odisha (21)', 'GST place of supply state and 2-digit code'],
    ['Billed To (Consignee)', 'NEW BIJAYA PUSTAK BHANDRA', 'Consignee / buyer business entity name'],
    ['Shipped To (Delivery Godown)', 'SAHAJBAHAL GODOWN / KUCHINDA DEPOT', 'Physical unloading depot or storage warehouse'],
    ['Overall Invoice Discount (₹)', 0, 'Lump-sum bill-level discount or credit note deduction'],
  ];
  const providerWs = XLSX.utils.aoa_to_sheet(providerDetailsRows);
  providerWs['!cols'] = [{ wch: 32 }, { wch: 38 }, { wch: 65 }];
  XLSX.utils.book_append_sheet(wb, providerWs, 'Invoice_Provider_Details');

  // Sheet 2: Inward Items Table
  const itemsHeader = [
    'Supplier Name',
    'Supplier GSTIN',
    'Invoice No',
    'Invoice Date',
    'Vehicle No',
    'Place of Supply',
    'Billed To',
    'Item Description',
    'Category',
    'Pack',
    'Volume (ml)',
    'HSN/SAC',
    'Billed Cases',
    'Free Bonus Cases',
    'Unit Rate (₹)',
    'Scheme Type',
    'Discount %',
    'Flat Off / Case (₹)',
    'Scheme Label',
    'CGST %',
    'SGST %',
    'Wholesale Selling Rate (₹)',
    'Retail MRP (₹)',
    'Batch Number',
    'Mfg Date (YYYY-MM-DD)',
    'Expiry Date (YYYY-MM-DD)',
  ];

  const itemsRows = [
    itemsHeader,
    [
      'RADHIKA ENTERPRISES',
      '21FSDPR8480R1ZU',
      '38/26-27',
      '2026-09-12',
      'OD15AF7869',
      'Odisha (21)',
      'NEW BIJAYA PUSTAK BHANDRA',
      'CAMPA POWER UP 150ML PET',
      'energy',
      'PET',
      150,
      '22021090',
      150,
      0,
      222.0,
      'none',
      0,
      0,
      'None',
      20,
      20,
      245,
      265,
      'LOT-PU15-9481',
      '2026-09-01',
      '2027-03-31',
    ],
    [
      'RADHIKA ENTERPRISES',
      '21FSDPR8480R1ZU',
      '38/26-27',
      '2026-09-12',
      'OD15AF7869',
      'Odisha (21)',
      'NEW BIJAYA PUSTAK BHANDRA',
      'E.H. VIBE COLA 150ML',
      'vibe',
      'PET',
      150,
      '22021010',
      60,
      6,
      210.0,
      'free_cases',
      0,
      0,
      '10+1 Dealer Promo Scheme',
      20,
      20,
      230,
      250,
      'LOT-VC15-8821',
      '2026-09-01',
      '2027-03-31',
    ],
    [
      'RADHIKA ENTERPRISES',
      '21FSDPR8480R1ZU',
      '38/26-27',
      '2026-09-12',
      'OD15AF7869',
      'Odisha (21)',
      'NEW BIJAYA PUSTAK BHANDRA',
      'SOSYO JOOS MANGO 160ML PET',
      'joos',
      'PET',
      160,
      '22029920',
      80,
      0,
      200.0,
      'discount_flat',
      0,
      15,
      '₹15 Off per Case Flat Discount',
      2.5,
      2.5,
      220,
      240,
      'LOT-JM16-7731',
      '2026-08-25',
      '2027-04-30',
    ],
  ];

  const itemsWs = XLSX.utils.aoa_to_sheet(itemsRows);
  itemsWs['!cols'] = [
    { wch: 22 }, // Supplier Name
    { wch: 18 }, // Supplier GSTIN
    { wch: 12 }, // Invoice No
    { wch: 12 }, // Invoice Date
    { wch: 14 }, // Vehicle No
    { wch: 15 }, // Place of Supply
    { wch: 25 }, // Billed To
    { wch: 30 }, // Item Description
    { wch: 10 }, // Category
    { wch: 8 },  // Pack
    { wch: 12 }, // Volume
    { wch: 12 }, // HSN/SAC
    { wch: 14 }, // Billed Cases
    { wch: 16 }, // Free Bonus Cases
    { wch: 14 }, // Unit Rate
    { wch: 14 }, // Scheme Type
    { wch: 12 }, // Discount %
    { wch: 18 }, // Flat Off
    { wch: 26 }, // Scheme Label
    { wch: 9 },  // CGST
    { wch: 9 },  // SGST
    { wch: 24 }, // Wholesale
    { wch: 16 }, // Retail
    { wch: 18 }, // Batch
    { wch: 14 }, // Mfg Date
    { wch: 14 }, // Expiry Date
  ];
  XLSX.utils.book_append_sheet(wb, itemsWs, 'Inward_Items_Table');

  // Sheet 3: GST Slabs Guide
  const gstGuideRows = [
    ['BEVERAGE GST SLABS & TAX CLASSIFICATION GUIDE', '', ''],
    ['Category Brand', 'HSN Code', 'Applicable GST Rate', 'Tax Breakdown (Intra-State)', 'Notes'],
    ['Energy Drinks (Campa Power Up, etc.)', '2202 10 90', '40% GST', '20% CGST + 20% SGST', 'Aerated caffeinated energy drinks with sugar'],
    ['Carbonated Flavored Soda (Vibe Cola, Jeera, Lime)', '2202 10 10 / 2202 10 20', '40% GST', '20% CGST + 20% SGST', 'Carbonated soft drinks & flavored sodas'],
    ['Fruit Juices & Fruit Nectars (Sosyo Joos Mango/Guava)', '2202 99 20', '5% / 12% GST', '2.5% CGST + 2.5% SGST', 'Fruit juice based still beverages'],
    ['Packaged Natural Drinking Water', '2201 10 10', '18% GST', '9% CGST + 9% SGST', 'Mineral water & purified drinking water'],
    ['Dairy & Milk-based Flavored Drinks', '0402 99 90', '12% GST', '6% CGST + 6% SGST', 'Flavored milk & milk-based beverages'],
  ];
  const gstWs = XLSX.utils.aoa_to_sheet(gstGuideRows);
  gstWs['!cols'] = [{ wch: 38 }, { wch: 18 }, { wch: 18 }, { wch: 28 }, { wch: 45 }];
  XLSX.utils.book_append_sheet(wb, gstWs, 'GST_Slabs_Guide');

  XLSX.writeFile(wb, 'Radhika_Beverages_Inward_Template.xlsx');
}

