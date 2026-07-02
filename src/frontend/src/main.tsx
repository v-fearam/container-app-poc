import React from 'react';
import ReactDOM from 'react-dom/client';
import { AppInsightsContext } from '@microsoft/applicationinsights-react-js';
import { reactPlugin } from './appInsights';
import App from './App.tsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppInsightsContext.Provider value={reactPlugin}>
      <App />
    </AppInsightsContext.Provider>
  </React.StrictMode>,
);
