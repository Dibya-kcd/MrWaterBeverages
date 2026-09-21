import React from 'react';
import { MessageCircle } from 'lucide-react';
import { useLedger } from '../../context/LedgerContext';
import { Bill } from '../../types';
import { buildBillText, whatsappLink } from '../../utils/billing';

export const WhatsAppButton: React.FC<{ bill: Bill; label?: string; id?: string }> = ({
  bill,
  label,
  id,
}) => {
  const { scale, orgProfile, billingSettings } = useLedger();
  const text = buildBillText(bill, orgProfile, billingSettings);
  const href = whatsappLink(bill.phone, text);

  return (
    <a
      id={id}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label || `Send bill #${bill.id} on WhatsApp`}
      title={label || `Send bill #${bill.id} on WhatsApp`}
      className="border-2 p-2 flex items-center justify-center focus-ring cursor-pointer hover:opacity-90"
      style={{
        borderColor: '#1EBE5D',
        backgroundColor: '#25D366',
        color: '#FFFFFF',
        minWidth: `${36 * scale}px`,
        minHeight: `${36 * scale}px`,
      }}
    >
      <MessageCircle size={Math.round(18 * scale)} aria-hidden="true" />
    </a>
  );
};
