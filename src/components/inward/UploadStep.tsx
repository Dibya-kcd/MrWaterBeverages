import React from 'react';
import {
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Download,
  Plus,
  ArrowRight,
} from 'lucide-react';
import { Button } from '../ui';
import { useIsMobile } from '../../hooks/useIsMobile';

interface UploadStepProps {
  isDragging: boolean;
  setIsDragging: (val: boolean) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  processUploadedFile: (file: File) => void;
  isParsing: boolean;
  parsingStatus: string;
  handleDownloadCsvSample: () => void;
  handleDownloadSample: () => void;
  handleStartBlankConsignment: () => void;
  parseError?: string | null;
  lastUploadedFile?: File | null;
  uploadedFileName?: string | null;
  onClearError?: () => void;
}

export const UploadStep: React.FC<UploadStepProps> = ({
  isDragging,
  setIsDragging,
  fileInputRef,
  processUploadedFile,
  isParsing,
  parsingStatus,
  handleDownloadCsvSample,
  handleDownloadSample,
  handleStartBlankConsignment,
  parseError,
  lastUploadedFile,
  uploadedFileName,
  onClearError,
}) => {
  const isPhone = useIsMobile(767);

  if (isPhone) {
    const activeFileName = uploadedFileName || lastUploadedFile?.name;
    return (
      <div className="p-3.5 overflow-y-auto flex flex-col gap-3 flex-1 bg-[#f3f5f9]">
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv,.pdf,.jpg,.jpeg,.png,.webp"
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) {
              processUploadedFile(e.target.files[0]);
            }
          }}
        />

        {isParsing ? (
          <div className="hh-inv-card py-10 px-5 flex flex-col items-center text-center gap-3">
            <div className="w-10 h-10 border-[3.5px] border-[#2864d9] border-t-slate-200 rounded-full animate-spin" />
            <div className="text-[16px] font-extrabold text-slate-900">
              Analyzing document...
            </div>
            <p className="text-[12.5px] text-slate-500 leading-relaxed max-w-[280px]">
              Extracting header details, matching the beverage catalog, calculating taxes and scheme incentives.
            </p>
            {activeFileName && (
              <span className="px-3 py-1 rounded-full bg-sky-50 text-[#2864d9] text-[12px] font-bold max-w-full truncate">
                {activeFileName}
              </span>
            )}
          </div>
        ) : parseError ? (
          <div className="flex flex-col gap-2.5">
            <div className="hh-inv-card hh-inv-card--alert-red space-y-1">
              <div className="text-[14.5px] font-extrabold text-rose-600">
                Could not read this file
              </div>
              <p className="text-[12.5px] text-slate-600 leading-relaxed break-words">
                {parseError}
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                onClearError?.();
                fileInputRef.current?.click();
              }}
              className="hh-inv-btn-primary w-full"
            >
              Try another file
            </button>
            <button
              type="button"
              onClick={handleDownloadSample}
              className="hh-inv-btn-outline w-full"
            >
              Download template
            </button>
            <button
              type="button"
              onClick={() => {
                onClearError?.();
                handleStartBlankConsignment();
              }}
              className="hh-inv-btn-outline w-full"
            >
              Start manual entry
            </button>
          </div>
        ) : (
          <>
            <div
              onClick={() => fileInputRef.current?.click()}
              className="hh-inv-card border-dashed border-[1.5px] border-slate-300 py-5 px-4 flex flex-col items-center text-center gap-2.5 cursor-pointer"
            >
              <div className="flex items-center gap-2.5 mb-0.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div className="w-9 h-9 rounded-xl bg-sky-50 text-[#2864d9] border border-sky-200 flex items-center justify-center">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center justify-center">
                  <ImageIcon className="w-5 h-5" />
                </div>
              </div>
              <h3 className="text-[15.5px] font-extrabold text-slate-900 leading-snug">
                Upload your supplier invoice
              </h3>
              <p className="text-[12px] text-slate-500 leading-relaxed max-w-[270px]">
                Excel (.xlsx, .xls), CSV (.csv), PDF invoices, or a photo / scanned bill (.jpg, .png).
              </p>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
                className="hh-inv-btn-primary w-full mt-1"
              >
                Browse file
              </button>
            </div>

            <div className="hh-inv-card space-y-2.5">
              <div>
                <h4 className="text-[14px] font-extrabold text-slate-900">
                  Download inward templates
                </h4>
                <p className="text-[12px] text-slate-500 mt-0.5 leading-snug">
                  Fill provider details and item columns, then upload.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleDownloadCsvSample}
                  className="hh-inv-btn-outline text-[13px]!"
                >
                  CSV template
                </button>
                <button
                  type="button"
                  onClick={handleDownloadSample}
                  className="hh-inv-btn-outline text-[13px]!"
                >
                  Excel (.xlsx)
                </button>
              </div>
            </div>

            <div className="hh-inv-card space-y-2.5">
              <div>
                <h4 className="text-[14px] font-extrabold text-slate-900">
                  Direct manual inward entry
                </h4>
                <p className="text-[12px] text-slate-500 mt-0.5 leading-relaxed">
                  Skip the file and start with an empty consignment. Fast entry for physical paper receipts.
                </p>
              </div>
              <button
                type="button"
                onClick={handleStartBlankConsignment}
                className="hh-inv-btn-primary w-full"
              >
                Start manual entry →
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 overflow-y-auto flex flex-col gap-6 flex-1">
      {/* Drag & Drop Dropzone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            processUploadedFile(e.dataTransfer.files[0]);
          }
        }}
        className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center transition-all cursor-pointer ${
          isDragging
            ? 'border-indigo-600 bg-indigo-50/70 scale-[0.99]'
            : 'border-slate-300 hover:border-indigo-400 bg-slate-50/50 hover:bg-indigo-50/30'
        }`}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv,.pdf,.jpg,.jpeg,.png,.webp"
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) {
              processUploadedFile(e.target.files[0]);
            }
          }}
        />

        {isParsing ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-base font-bold text-indigo-900">
              {parsingStatus || 'Analyzing document...'}
            </p>
            <p className="text-xs text-slate-500 max-w-md">
              Extracting header metadata, matching beverage catalog, calculating taxes & scheme incentives.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3.5 bg-emerald-100 text-emerald-700 rounded-full shadow-sm">
                <FileSpreadsheet className="w-7 h-7" />
              </div>
              <div className="p-3.5 bg-blue-100 text-sky-700 rounded-full shadow-sm">
                <FileText className="w-7 h-7" />
              </div>
              <div className="p-3.5 bg-indigo-100 text-indigo-700 rounded-full shadow-sm">
                <ImageIcon className="w-7 h-7" />
              </div>
            </div>

            <h3 className="text-base sm:text-lg font-bold text-slate-800 mb-1">
              Drag & Drop your Supplier Invoice here, or{' '}
              <span className="text-indigo-600 underline">Browse File</span>
            </h3>
            <p className="text-xs text-slate-500 max-w-lg mb-5">
              Supports <strong>Excel (.xlsx, .xls)</strong>, <strong>CSV (.csv)</strong>,{' '}
              <strong>PDF invoices</strong>, and <strong>Photo / Scanned bills (.jpg, .png)</strong>.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-slate-600 max-w-2xl w-full">
              <div className="p-2.5 bg-white border border-slate-200 rounded-lg shadow-sm font-medium text-center">
                ✓ Billed vs Free cases
              </div>
              <div className="p-2.5 bg-white border border-slate-200 rounded-lg shadow-sm font-medium text-center">
                ✓ New vs Existing products
              </div>
              <div className="p-2.5 bg-white border border-slate-200 rounded-lg shadow-sm font-medium text-center">
                ✓ Auto GST Calculation
              </div>
              <div className="p-2.5 bg-white border border-slate-200 rounded-lg shadow-sm font-medium text-center">
                ✓ Landed Cost Computation
              </div>
            </div>
          </>
        )}
      </div>

      {/* Action Options: Template Download & Manual Entry */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Option 1: Download Sample Excel / CSV Templates */}
        <div className="p-5 rounded-xl border border-slate-200 bg-white shadow-sm hover:border-indigo-300 transition-all flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2 text-emerald-700">
              <FileSpreadsheet className="w-5 h-5" />
              <h4 className="font-bold text-sm text-slate-900">
                Download Updated Inward Templates (Excel / CSV)
              </h4>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed mb-3">
              Updated to capture <strong>complete Invoice Provider Details</strong>: Supplier / Distributor Name,
              GSTIN, Registered Address, Phone, Email, Invoice No, Invoice Date, Vehicle No, Place of Supply (POS),
              Billed To, and Shipped To.
            </p>
            <div className="flex flex-wrap gap-1.5 text-[11px] text-emerald-800">
              <span className="px-2 py-0.5 bg-emerald-50 border border-emerald-200 rounded font-medium">
                ✓ Provider Details Sheet
              </span>
              <span className="px-2 py-0.5 bg-emerald-50 border border-emerald-200 rounded font-medium">
                ✓ Beverage Item Columns
              </span>
              <span className="px-2 py-0.5 bg-emerald-50 border border-emerald-200 rounded font-medium">
                ✓ GST Slabs Reference
              </span>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] text-slate-500 font-medium">
              Includes sample data ready for instant import
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleDownloadCsvSample}
                leftIcon={<Download className="w-3.5 h-3.5" />}
                title="Download flat CSV template with provider and item columns"
              >
                CSV Template
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleDownloadSample}
                leftIcon={<Download className="w-3.5 h-3.5" />}
                title="Download multi-sheet Excel workbook with Provider Details, Items, and Tax Guides"
              >
                Excel Template (.xlsx)
              </Button>
            </div>
          </div>
        </div>

        {/* Option 2: Start Manual Consignment */}
        <div className="p-5 rounded-xl border border-slate-200 bg-white shadow-sm hover:border-indigo-300 transition-all flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2 text-indigo-700">
              <Plus className="w-5 h-5" />
              <h4 className="font-bold text-sm text-slate-900">
                Direct Manual Inward Entry
              </h4>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Skip uploading a file and start directly with an empty consignment in the review screen. Add beverage products,
              specify schemes, enter supplier details, and post stock straight to your godown.
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
            <span className="text-[11px] text-slate-500">Fast entry for physical paper receipts</span>
            <Button
              variant="primary"
              size="sm"
              onClick={handleStartBlankConsignment}
              rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
            >
              Start Manual Entry
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
