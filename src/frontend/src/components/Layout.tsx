import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { appInsights } from '../appInsights';
import { Navbar } from './Navbar';

export function Layout() {
  const location = useLocation();

  useEffect(() => {
    appInsights.trackPageView({ uri: location.pathname });
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Outlet />
      </main>

      <footer className="mt-20 border-t border-gray-200 bg-white/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center text-slate-600">
            <p className="text-sm">
              © 2026 Camuzzi - Aplicación de demostración con Azure Container Apps
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
