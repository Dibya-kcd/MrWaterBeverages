import React, { useState } from 'react';
import { Download, Smartphone, X, CheckCircle2 } from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  className?: string;
  variant?: 'compact' | 'full';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  className = '',
  variant = 'compact',
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [installedNotice, setInstalledNotice] = useState(false);

  // If already installed as PWA standalone, hide button
  if (isInstalled && !installedNotice) {
    return null;
  }

  const handleInstallClick = async () => {
    const success = await install();
    if (success) {
      setInstalledNotice(true);
      setTimeout(() => setInstalledNotice(false), 5000);
    }
  };

  if (installedNotice) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-xl text-xs font-black">
        <CheckCircle2 size={14} className="text-emerald-700" />
        <span>App Installed!</span>
      </div>
    );
  }

  // Android / Chrome / Edge / Desktop PWA Flow
  if (isInstallable) {
    return (
      <button
        type="button"
        id="btn-pwa-install-app"
        onClick={handleInstallClick}
        className={`flex items-center justify-center gap-1.5 rounded-xl border-2 border-amber-600 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-slate-950 font-black text-xs min-h-[40px] px-3.5 py-1.5 cursor-pointer shadow-xs transition-colors whitespace-nowrap ${className}`}
        title="Install Radhika Ledger App on this phone or desktop"
        aria-label="Install App"
      >
        <Download size={15} className="shrink-0 stroke-[2.5]" />
        <span>{variant === 'full' ? 'Install Android / PWA App' : 'Install App'}</span>
      </button>
    );
  }

  // iOS Safari Flow
  if (isIOS) {
    return (
      <>
        <button
          type="button"
          id="btn-pwa-install-ios"
          onClick={() => setShowIOSGuide(true)}
          className={`flex items-center justify-center gap-1.5 rounded-xl border-2 border-blue-400 bg-blue-50 hover:bg-blue-100 text-blue-950 font-black text-xs min-h-[40px] px-3.5 py-1.5 cursor-pointer shadow-xs transition-colors whitespace-nowrap ${className}`}
          title="Install on iPhone or iPad"
          aria-label="Install on iPhone / iPad"
        >
          <Smartphone size={15} className="shrink-0" />
          <span>{variant === 'full' ? 'Install on iPhone / iPad' : 'Install App'}</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
            <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl border-2 border-slate-300 text-slate-900 space-y-4">
              <div className="flex items-center justify-between border-b pb-3">
                <h3 className="font-black text-base text-slate-900 flex items-center gap-2">
                  <Smartphone size={18} className="text-blue-900" />
                  <span>Install on iPhone / iPad</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
                  aria-label="Close guide"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-3 text-xs text-slate-700 leading-relaxed font-semibold">
                <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-blue-50 border border-blue-200">
                  <span className="w-5 h-5 rounded-full bg-blue-900 text-white flex items-center justify-center font-bold text-[11px] shrink-0 mt-0.5">
                    1
                  </span>
                  <span>Tap the <strong>Share</strong> icon (box with upward arrow) in the Safari navigation bar.</span>
                </div>

                <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-blue-50 border border-blue-200">
                  <span className="w-5 h-5 rounded-full bg-blue-900 text-white flex items-center justify-center font-bold text-[11px] shrink-0 mt-0.5">
                    2
                  </span>
                  <span>Scroll down and tap <strong>Add to Home Screen</strong>.</span>
                </div>

                <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-blue-50 border border-blue-200">
                  <span className="w-5 h-5 rounded-full bg-blue-900 text-white flex items-center justify-center font-bold text-[11px] shrink-0 mt-0.5">
                    3
                  </span>
                  <span>Tap <strong>Add</strong> in top right. The app will appear on your home screen for full offline use!</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full min-h-[44px] rounded-xl bg-blue-900 hover:bg-blue-950 text-white font-black text-xs cursor-pointer shadow-xs"
              >
                Got It
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  // Fallback for browsers when beforeinstallprompt has not fired yet or manual desktop install
  return null;
};
