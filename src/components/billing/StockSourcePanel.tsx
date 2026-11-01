import React from 'react';
import { Building2, Layers, Truck } from 'lucide-react';
import { Trip, Warehouse } from '../../types';

export type StockSourceType = 'warehouse' | 'trip';

export interface StockSourcePanelProps {
  stockSourceType: StockSourceType;
  onSourceTypeChange: (type: StockSourceType) => void;
  warehouses: Warehouse[];
  selectedWarehouseId: string;
  onWarehouseChange: (id: string) => void;
  warehouseStock: (id: string) => number;
  trips: Trip[];
  selectedTripId: number | null;
  onTripChange: (id: number) => void;
  selectedTrip: Trip | null | undefined;
  paletteLine: string;
  onNotify?: (message: string) => void;
}

/**
 * Presentational panel: choose godown vs van/trip stock when billing.
 * Extracted from BillingWorkflow to shrink the god-component and reuse later.
 */
export const StockSourcePanel: React.FC<StockSourcePanelProps> = ({
  stockSourceType,
  onSourceTypeChange,
  warehouses,
  selectedWarehouseId,
  onWarehouseChange,
  warehouseStock,
  trips,
  selectedTripId,
  onTripChange,
  selectedTrip,
  paletteLine,
  onNotify,
}) => {
  return (
    <div
      id="section-stock-sourcing"
      className="p-3.5 sm:p-4 rounded-2xl border-2 bg-white shadow-sm space-y-3"
      style={{ borderColor: paletteLine }}
    >
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Layers size={18} className="text-sky-700" />
          <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide">
            Stock Source / Inventory Sourcing
          </h2>
        </div>

        <div className="text-xs font-bold text-slate-500">
          Current Source:{' '}
          <strong className="text-blue-950">
            {stockSourceType === 'warehouse'
              ? warehouses.find((w) => w.id === selectedWarehouseId)?.name || 'Main Godown'
              : selectedTrip
                ? `${selectedTrip.vehicle} (${selectedTrip.salesman || 'Van'})`
                : 'No Trip'}
          </strong>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          id="tab-source-warehouse"
          onClick={() => {
            onSourceTypeChange('warehouse');
            onNotify?.('Switched inventory source to Warehouse / Godown.');
          }}
          className={`min-h-[46px] p-2.5 rounded-xl border-2 font-black text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer transition-all ${
            stockSourceType === 'warehouse'
              ? 'bg-sky-600 text-white border-sky-600 shadow-md ring-2 ring-blue-700/20'
              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
          }`}
        >
          <Building2 size={18} />
          <span>Warehouse / Godown Stock</span>
        </button>

        <button
          type="button"
          id="tab-source-trip"
          onClick={() => {
            onSourceTypeChange('trip');
            onNotify?.('Switched inventory source to Van / Trip Dispatch.');
          }}
          className={`min-h-[46px] p-2.5 rounded-xl border-2 font-black text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer transition-all ${
            stockSourceType === 'trip'
              ? 'bg-emerald-600 text-white border-emerald-600 shadow-md ring-2 ring-emerald-700/20'
              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
          }`}
        >
          <Truck size={18} />
          <span>Van / Trip Stock</span>
        </button>
      </div>

      {stockSourceType === 'warehouse' ? (
        <div className="p-3 rounded-xl bg-sky-50/50 border border-sky-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex-1 space-y-1">
            <label htmlFor="select-warehouse-source" className="text-xs font-bold text-slate-600 block">
              Select Godown / Warehouse:
            </label>
            <select
              id="select-warehouse-source"
              value={selectedWarehouseId}
              onChange={(e) => onWarehouseChange(e.target.value)}
              className="w-full sm:max-w-md px-3 py-2 rounded-xl border-2 border-slate-300 bg-white text-xs sm:text-sm font-bold text-slate-900 focus:outline-none focus:border-sky-600"
            >
              {warehouses.map((w) => {
                const casesCount = warehouseStock(w.id);
                return (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.location || 'Depot'}) — {casesCount} cs total available
                  </option>
                );
              })}
            </select>
          </div>

          <div className="text-xs text-slate-600 space-y-0.5 sm:text-right">
            <div>
              Depot Location:{' '}
              <strong className="text-slate-900">
                {warehouses.find((w) => w.id === selectedWarehouseId)?.location || 'Central Facility'}
              </strong>
            </div>
            <div className="text-emerald-700 font-black">
              Total Godown Inventory: {warehouseStock(selectedWarehouseId)} Cases
            </div>
          </div>
        </div>
      ) : (
        <div className="p-3 rounded-xl bg-emerald-50/50 border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex-1 space-y-1">
            <label htmlFor="select-trip-source" className="text-xs font-bold text-slate-600 block">
              Select Active Van / Dispatch Trip:
            </label>
            {trips.filter((t) => t.status === 'out').length > 0 ? (
              <select
                id="select-trip-source"
                value={selectedTripId ?? ''}
                onChange={(e) => onTripChange(Number(e.target.value))}
                className="w-full sm:max-w-md px-3 py-2 rounded-xl border-2 border-slate-300 bg-white text-xs sm:text-sm font-bold text-slate-900 focus:outline-none focus:border-sky-600"
              >
                {trips
                  .filter((t) => t.status === 'out')
                  .map((t) => {
                    const loadedSum = Object.values(t.loaded || {}).reduce((a, b) => a + b, 0);
                    return (
                      <option key={t.id} value={t.id}>
                        Trip #{t.id} - {t.vehicle} ({t.salesman || 'Driver'}) — [{loadedSum} cs loaded]
                      </option>
                    );
                  })}
              </select>
            ) : (
              <div className="text-xs font-bold text-rose-700">
                No active dispatch trips found. Please dispatch an active trip in the Trips tab or switch to Warehouse stock.
              </div>
            )}
          </div>

          {selectedTrip && (
            <div className="text-xs text-slate-700 space-y-0.5 sm:text-right">
              <div className="flex items-center gap-1.5 sm:justify-end">
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                    selectedTrip.status === 'out'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-200 text-slate-800'
                  }`}
                >
                  Trip {selectedTrip.status}
                </span>
                <span className="font-extrabold text-slate-900">{selectedTrip.vehicle}</span>
              </div>
              <div className="text-slate-600">
                Salesman: <strong className="text-slate-900">{selectedTrip.salesman || 'Unassigned'}</strong>
                {selectedTrip.route && <span> • {selectedTrip.route}</span>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
