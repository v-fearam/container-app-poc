import { ApplicationInsights } from '@microsoft/applicationinsights-web';
import { ReactPlugin } from '@microsoft/applicationinsights-react-js';
import { runtimeConfig } from './runtimeConfig';

const reactPlugin = new ReactPlugin();
const connectionString = runtimeConfig.appInsightsConnectionString || import.meta.env.VITE_APPINSIGHTS_CONNECTION_STRING || '';

let appInsights: ApplicationInsights;

// Solo inicializar App Insights si hay connection string
if (connectionString) {
  appInsights = new ApplicationInsights({
    config: {
      connectionString,
      enableAutoRouteTracking: true,
      enableCorsCorrelation: true,
      enableRequestHeaderTracking: true,
      enableResponseHeaderTracking: true,
      correlationHeaderExcludedDomains: [],
      distributedTracingMode: 2,
      extensions: [reactPlugin],
    },
  });

  appInsights.loadAppInsights();
  appInsights.trackPageView();
  console.log('✅ Application Insights habilitado');
} else {
  // Mock para desarrollo sin App Insights
  appInsights = {
    trackEvent: (event: any) => console.log('Mock trackEvent:', event),
    trackMetric: (metric: any) => console.log('Mock trackMetric:', metric),
    trackException: (exception: any) => console.log('Mock trackException:', exception),
    trackPageView: () => console.log('Mock trackPageView'),
  } as any;
  console.log('⚠️ Application Insights no configurado - usando mock para desarrollo');
}

export { appInsights, reactPlugin };
