import React from 'react';
import { ConfirmModal, DeleteImpactItem } from '../ui/ConfirmModal';

export type { DeleteImpactItem };

export interface ConfirmDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  subtitle?: string;
  impactItems?: DeleteImpactItem[];
  warningNote?: string;
  confirmationPrompt?: string;
  confirmButtonLabel?: string;
}

export const ConfirmDeleteModal: React.FC<ConfirmDeleteModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  subtitle,
  impactItems = [],
  warningNote,
  confirmationPrompt = 'I understand this action will reverse or delete these records and cannot be undone.',
  confirmButtonLabel = 'Permanently Delete',
}) => {
  return (
    <ConfirmModal
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={onConfirm}
      title={title}
      subtitle={subtitle}
      impactItems={impactItems}
      warningNote={warningNote}
      confirmationPrompt={confirmationPrompt}
      confirmButtonLabel={confirmButtonLabel}
      requiresCheckbox={Boolean(confirmationPrompt)}
      variant="danger"
    />
  );
};
