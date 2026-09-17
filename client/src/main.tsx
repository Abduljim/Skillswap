import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { SocketProvider } from './contexts/SocketContext';
import { CallsProvider } from './contexts/CallsContext';
import { ToastProvider } from './contexts/ToastContext';
import { ThemeProvider } from './contexts/ThemeContext';
import './index.css';

// Build-time API URL — embedded into the bundle for the Android build.
// Set this to your deployed backend before running `npm run cap:sync`.
declare global {
  interface Window {
    __SKILLSWAP_API_URL__?: string;
  }
}
window.__SKILLSWAP_API_URL__ = (import.meta as any).env?.VITE_API_URL || '';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30_000,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ThemeProvider>
          <AuthProvider>
            <SocketProvider>
              <CallsProvider>
                <ToastProvider>
                  <App />
                </ToastProvider>
              </CallsProvider>
            </SocketProvider>
          </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);

// Remove the static loading splash once the app has mounted.
const splash = document.getElementById('app-splash');
if (splash) {
  splash.classList.add('hide');
  window.setTimeout(() => splash.remove(), 300);
}