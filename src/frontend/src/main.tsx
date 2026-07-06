import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AppInsightsContext } from '@microsoft/applicationinsights-react-js';
import { reactPlugin } from './appInsights';
import { AuthProvider } from './context/AuthContext';
import App from './App.tsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppInsightsContext.Provider value={reactPlugin}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </AppInsightsContext.Provider>
    </BrowserRouter>
  </React.StrictMode>,
);
