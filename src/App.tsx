import React, { useState } from 'react';
import { useLedger } from './context/LedgerContext';
import { DesktopSidebar, Nav, TabletRail } from './components/common/Nav';
import { TopBar } from './components/common/TopBar';
import { AppHeader } from './components/common/AppHeader';
import { MobileNav } from './components/common/MobileNav';
import { AuthScreen } from './components/common/AuthScreen';
import { ToastHost } from './components/common/ToastHost';
import { DialogHost } from './components/common/DialogHost';
import { OfflineIndicator } from './components/common/OfflineIndicator';
import { UpdatePrompt } from './components/common/UpdatePrompt';
import { DashboardView } from './components/views/DashboardView';
import { BillingView } from './components/views/BillingView';
import { CustomersView } from './components/views/CustomersView';
import { ProductsView } from './components/views/ProductsView';
import { InventoryView } from './components/views/InventoryView';
import { WarehousesView } from './components/views/WarehousesView';
import { SupplierSchemesView } from './components/views/SupplierSchemesView';
import { PaymentsView } from './components/views/PaymentsView';
import { ExpensesView } from './components/views/ExpensesView';
import { CratesDepositsView } from './components/views/CratesDepositsView';
import { PromotionsView } from './components/views/PromotionsView';
import { TripsView } from './components/views/TripsView';
import { ReportsView } from './components/views/ReportsView';
import { SettingsView } from './components/views/SettingsView';
import { SalesmanView } from './components/views/SalesmanView';

export function App() {
  const { tab, currentUser, currentRole, highContrast } = useLedger();
  const [menuOpen, setMenuOpen] = useState(false);

  if (!currentUser) {
    return (
      <>
        <AuthScreen />
        <OfflineIndicator />
        <UpdatePrompt />
        <ToastHost />
        <DialogHost />
      </>
    );
  }

  if (currentRole === 'salesman') {
    return (
      <div id="app-root" className={highContrast ? 'high-contrast' : undefined}>
        <SalesmanView />
        <OfflineIndicator />
        <UpdatePrompt />
        <ToastHost />
        <DialogHost />
      </div>
    );
  }

  const renderTab = () => {
    switch (tab) {
      case 'dashboard':
        return <DashboardView />;
      case 'billing':
        return <BillingView />;
      case 'customers':
        return <CustomersView />;
      case 'products':
        return <ProductsView />;
      case 'inventory':
        return <InventoryView initialSubTab="realtime" />;
      case 'grn':
        return <InventoryView initialSubTab="consignments" />;
      case 'audit':
        return <InventoryView initialSubTab="audit" />;
      case 'warehouses':
        return <WarehousesView />;
      case 'promotions':
        return <PromotionsView />;
      case 'supplierSchemes':
        return <SupplierSchemesView />;
      case 'payments':
        return <PaymentsView />;
      case 'expenses':
        return <ExpensesView />;
      case 'crates':
        return <CratesDepositsView />;
      case 'trips':
        return <TripsView />;
      case 'reports':
        return <ReportsView />;
      case 'salesmen':
        return <SettingsView initialSection="staff" />;
      case 'salesman':
        return <SalesmanView />;
      case 'settings':
        return <SettingsView />;
      default:
        return <DashboardView />;
    }
  };

  return (
    <div id="app-root" className={`app-shell md:flex-row${highContrast ? ' high-contrast' : ''}`}>
      <DesktopSidebar />
      <TabletRail onOpenMenu={() => setMenuOpen(true)} />

      <div className="app-main">
        <AppHeader onMenuClick={() => setMenuOpen(true)} />
        <TopBar />

        <main className="app-content hh-main">
          <div className="flex-1 hh-page">{renderTab()}</div>
        </main>
      </div>

      <MobileNav onOpenMenu={() => setMenuOpen(true)} />
      <Nav open={menuOpen} onClose={() => setMenuOpen(false)} />
      <OfflineIndicator />
      <UpdatePrompt />
      <ToastHost />
      <DialogHost />
    </div>
  );
}

export default App;
