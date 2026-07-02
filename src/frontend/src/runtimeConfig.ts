interface RuntimeWindowConfig {
  API_URL?: string;
  APPINSIGHTS_CONNECTION_STRING?: string;
}

declare global {
  interface Window {
    __APP_CONFIG__?: RuntimeWindowConfig;
  }
}

const appConfig = window.__APP_CONFIG__;

export const runtimeConfig = {
  apiUrl: appConfig?.API_URL?.trim() ?? '',
  appInsightsConnectionString: appConfig?.APPINSIGHTS_CONNECTION_STRING?.trim() ?? '',
};
