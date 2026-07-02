import { ApplicationInsights } from '@microsoft/applicationinsights-web';
import { ReactPlugin } from '@microsoft/applicationinsights-react-js';

const reactPlugin = new ReactPlugin();

const appInsights = new ApplicationInsights({
  config: {
    connectionString: import.meta.env.VITE_APPINSIGHTS_CONNECTION_STRING || '',
    enableAutoRouteTracking: true,
    enableCorsCorrelation: true, // Habilita correlación CORS
    enableRequestHeaderTracking: true,
    enableResponseHeaderTracking: true,
    correlationHeaderExcludedDomains: [], // Dominios excluidos de correlación
    distributedTracingMode: 2, // AI_AND_W3C mode para compatibilidad completa
    extensions: [reactPlugin],
  },
});

appInsights.loadAppInsights();

// Track page view inicial
appInsights.trackPageView();

export { appInsights, reactPlugin };
