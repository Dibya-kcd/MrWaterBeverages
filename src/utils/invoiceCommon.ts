import { Bill } from '../types';

/** Shared by the A4 invoice PDF, the 80mm receipt and the WhatsApp text, so all three agree. */
export function inrToWords(num: number): string {
  if (isNaN(num) || num <= 0) return 'Rupees Zero Only';

  const a = [
    '',
    'One',
    'Two',
    'Three',
    'Four',
    'Five',
    'Six',
    'Seven',
    'Eight',
    'Nine',
    'Ten',
    'Eleven',
    'Twelve',
    'Thirteen',
    'Fourteen',
    'Fifteen',
    'Sixteen',
    'Seventeen',
    'Eighteen',
    'Nineteen',
  ];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const convertTwoDigits = (n: number): string => {
    if (n === 0) return '';
    if (n < 20) return a[n];
    return b[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + a[n % 10] : '');
  };

  const convertThreeDigits = (n: number): string => {
    const hundred = Math.floor(n / 100);
    const remainder = n % 100;
    let res = '';
    if (hundred > 0) res += a[hundred] + ' Hundred';
    if (remainder > 0) res += (res ? ' and ' : '') + convertTwoDigits(remainder);
    return res;
  };

  const whole = Math.floor(num);
  const paise = Math.round((num - whole) * 100);

  let crore = Math.floor(whole / 10000000);
  let lakh = Math.floor((whole % 10000000) / 100000);
  let thousand = Math.floor((whole % 100000) / 1000);
  let remainder = whole % 1000;

  let parts: string[] = [];
  if (crore > 0) parts.push(convertThreeDigits(crore) + ' Crore');
  if (lakh > 0) parts.push(convertThreeDigits(lakh) + ' Lakh');
  if (thousand > 0) parts.push(convertThreeDigits(thousand) + ' Thousand');
  if (remainder > 0) parts.push(convertThreeDigits(remainder));

  let res = 'Rupees ' + (parts.join(' ') || 'Zero');
  if (paise > 0) {
    res += ' and ' + convertTwoDigits(paise) + ' Paise';
  }
  return res + ' Only';
}

export function isBillGstInvoice(bill: Bill, invoiceFormat?: 'gst' | 'non_gst'): boolean {
  // A bill issued by a composition / unregistered business can never be shown as a Tax Invoice, whatever format is asked for.
  if (bill.taxStamp && bill.taxStamp.registrationType !== 'regular') return false;
  if (invoiceFormat !== undefined) return invoiceFormat === 'gst';
  if (bill.invoiceType === 'tax_invoice' || bill.isGstInvoice === true) return true;
  if (bill.invoiceType === 'retail' || bill.invoiceType === 'bill_of_supply' || bill.isGstInvoice === false) return false;
  return bill.supplyType === 'B2B' && Boolean(bill.customerGstin);
}
