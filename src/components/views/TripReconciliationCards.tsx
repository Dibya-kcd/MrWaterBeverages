import React, { useState } from 'react';
import { LayoutGrid, List } from 'lucide-react';
import { PaletteTokens } from '../../types';

export interface TripProductReconciliationRow {
  productId: number;
  name: string;
  loaded: number;
  sold: number;
  returned: number;
  discrepancy: number;
}

export interface CustomerDeliveryItem {
  customer: string;
  qty: number;
  billId: number;
}

interface TripReconciliationCardsProps {
  tripId: number;
  rows: TripProductReconciliationRow[];
  tripStatus: 'out' | 'closed';
  customerDeliveriesByProduct: Record<number, CustomerDeliveryItem[]>;
  palette: PaletteTokens;
  fz: (px: number, extra?: React.CSSProperties) => React.CSSProperties;
}

export const TripReconciliationCards: React.FC<TripReconciliationCardsProps> = ({
  rows,
  tripStatus,
  customerDeliveriesByProduct,
  palette,
  fz,
}) => {
  // Default to 'cards' for responsive mobile/tablet friendly app view
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  return (
    <div className="space-y-3">
      {/* View Switcher Header */}
      <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
        <div className="font-bold text-slate-700">
          Vehicle Beverage Reconciliation ({rows.length} product{rows.length === 1 ? '' : 's'})
        </div>
        <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded border border-slate-200">
          <button
            type="button"
            onClick={() => setViewMode('cards')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-bold transition-colors cursor-pointer ${
              viewMode === 'cards'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
            title="Card view (Recommended for mobile & tablet)"
          >
            <LayoutGrid size={13} />
            <span>Cards</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('table')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-bold transition-colors cursor-pointer ${
              viewMode === 'table'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
            title="Compact table view"
          >
            <List size={13} />
            <span>Table</span>
          </button>
        </div>
      </div>

      {/* Cards View (Default, Mobile & Tablet Optimized) */}
      {viewMode === 'cards' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {rows.map((r) => {
            const bad = tripStatus === 'closed' && r.discrepancy !== 0;
            const deliveries = customerDeliveriesByProduct[r.productId] || [];
            const remainingOnVan = Math.max(0, r.loaded - r.sold);

            return (
              <div
                key={r.productId}
                className="border-2 rounded-lg p-3 bg-white shadow-xs flex flex-col justify-between transition-all hover:border-slate-400"
                style={{
                  borderColor: bad ? `${palette.bad}70` : palette.line,
                }}
              >
                <div>
                  {/* Card Header: Product Name & Status Badge */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-extrabold text-slate-900 text-sm leading-tight">
                      {r.name}
                    </div>
                    <span
                      className="text-[11px] font-bold px-2 py-0.5 rounded border shrink-0"
                      style={{
                        borderColor: bad ? palette.bad : palette.good,
                        color: bad ? palette.bad : palette.good,
                        backgroundColor: bad ? `${palette.bad}10` : `${palette.good}10`,
                      }}
                    >
                      {tripStatus === 'closed'
                        ? r.discrepancy === 0
                          ? 'Balanced (0)'
                          : `${r.discrepancy > 0 ? `+${r.discrepancy} cs missing` : `${Math.abs(r.discrepancy)} cs surplus`}`
                        : `${remainingOnVan} cs on van`}
                    </span>
                  </div>

                  {/* 3-Column Metrics Grid */}
                  <div className="grid grid-cols-3 gap-1.5 mt-2.5 pt-2 border-t border-slate-100 text-center text-xs">
                    <div className="bg-slate-50 p-1.5 rounded border border-slate-200">
                      <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                        Loaded
                      </div>
                      <div className="font-black text-slate-900 mt-0.5">{r.loaded} cs</div>
                    </div>

                    <div className="bg-emerald-50/50 p-1.5 rounded border border-emerald-200">
                      <div className="text-[10px] text-emerald-700 font-bold uppercase tracking-wider">
                        Delivered
                      </div>
                      <div className="font-black text-emerald-800 mt-0.5">{r.sold} cs</div>
                    </div>

                    <div
                      className="p-1.5 rounded border"
                      style={{
                        backgroundColor: bad ? `${palette.bad}10` : '#F8FAFC',
                        borderColor: bad ? `${palette.bad}40` : '#E2E8F0',
                      }}
                    >
                      <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                        {tripStatus === 'closed' ? 'Returned' : 'Remaining'}
                      </div>
                      <div
                        className="font-black mt-0.5"
                        style={{ color: bad ? palette.bad : palette.ink }}
                      >
                        {tripStatus === 'closed' ? `${r.returned} cs` : `${remainingOnVan} cs`}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Delivered Retailers List */}
                {deliveries.length > 0 && (
                  <div className="mt-2.5 pt-2 border-t border-slate-100 text-xs">
                    <div className="text-[10.5px] font-bold text-slate-500 mb-1">
                      Delivered to {deliveries.length} retailer{deliveries.length === 1 ? '' : 's'}:
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {deliveries.map((cd, idx) => (
                        <span
                          key={idx}
                          className="bg-slate-100 border border-slate-200 text-slate-800 px-1.5 py-0.5 rounded text-[11px] font-medium"
                        >
                          <strong>{cd.customer}</strong> ({cd.qty} cs)
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* Table View */
        <div
          className="border-2 overflow-x-auto rounded bg-white"
          style={{ borderColor: palette.line }}
        >
          <table className="w-full text-left" style={fz(13)}>
            <thead>
              <tr className="border-b-2 bg-slate-50" style={{ borderColor: palette.line }}>
                <th className="px-3 py-2 font-bold">Beverage Name</th>
                <th className="px-3 py-2 text-right font-bold">Loaded</th>
                <th className="px-3 py-2 text-right font-bold">Delivered</th>
                <th className="px-3 py-2 text-right font-bold">
                  {tripStatus === 'closed' ? 'Returned' : 'Remaining on Van'}
                </th>
                <th className="px-3 py-2 text-right font-bold">Reconciliation</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const bad = tripStatus === 'closed' && r.discrepancy !== 0;
                const deliveries = customerDeliveriesByProduct[r.productId] || [];
                const remainingOnVan = Math.max(0, r.loaded - r.sold);

                return (
                  <tr
                    key={r.productId}
                    className="border-t hover:bg-slate-50/60"
                    style={{ borderColor: palette.line }}
                  >
                    <td className="px-3 py-2">
                      <div className="font-bold text-slate-900">{r.name}</div>
                      {deliveries.length > 0 && (
                        <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-slate-600">↳ Retailers:</span>
                          {deliveries.map((cd, idx) => (
                            <span
                              key={idx}
                              className="bg-slate-100 border border-slate-200 text-slate-800 px-1.5 py-0.5 rounded text-[10.5px]"
                            >
                              <strong>{cd.customer}</strong> ({cd.qty} cs)
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold">{r.loaded} cs</td>
                    <td className="px-3 py-2 text-right font-semibold text-emerald-800">
                      {r.sold} cs
                    </td>
                    <td className="px-3 py-2 text-right font-semibold">
                      {tripStatus === 'closed' ? `${r.returned} cs` : `${remainingOnVan} cs`}
                    </td>
                    <td
                      className="px-3 py-2 text-right font-bold"
                      style={{ color: bad ? palette.bad : palette.good }}
                    >
                      {tripStatus === 'closed'
                        ? r.discrepancy === 0
                          ? '0 (Balanced)'
                          : `${r.discrepancy > 0 ? `+${r.discrepancy}` : r.discrepancy} cs missing`
                        : 'On delivery run'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
