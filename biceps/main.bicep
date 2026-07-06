targetScope = 'resourceGroup'

@description('The location for all resources')
param location string = resourceGroup().location

@description('Workload short name used in resource names')
param workloadName string = 'weather'

@description('Environment short name used in resource names')
param environmentShortName string = 'dev'

@description('The name of the Container App Environment')
param environmentName string = 'cae-${workloadName}-${environmentShortName}-${take(uniqueString(resourceGroup().id), 6)}'

@description('The name of the Backend Container App')
param backendAppName string = 'ca-${workloadName}-be-${environmentShortName}'

@description('The name of the Frontend Container App')
param frontendAppName string = 'ca-${workloadName}-fe-${environmentShortName}'

@description('The name of the Container Registry')
param containerRegistryName string = 'acr${take(replace(toLower(workloadName), '-', ''), 12)}${take(uniqueString(resourceGroup().id), 8)}'

@description('The backend image name in ACR')
param backendImageName string = 'camuzzi-weather-backend'

@description('The frontend image name in ACR')
param frontendImageName string = 'camuzzi-weather-frontend'

@description('The tag for the container images')
param imageTag string = 'latest'

@description('Deploy Container Apps in this run')
param deployContainerApps bool = true

@description('Comma-separated explicit CORS origins allowed by backend API')
param corsAllowedOrigins string = 'http://localhost:5173,http://localhost:3000'

@description('Comma-separated host suffixes allowed for CORS origins')
param corsAllowedOriginSuffixes string = '.azurecontainerapps.io'

@description('Enable Easy Auth on Container Apps')
param enableEasyAuth bool = false

@description('Easy Auth frontend client ID')
param easyAuthFrontendClientId string = ''

@description('Easy Auth frontend client secret')
@secure()
param easyAuthFrontendClientSecret string = ''

@description('Easy Auth backend client ID')
param easyAuthBackendClientId string = ''

@description('Easy Auth backend client secret')
@secure()
param easyAuthBackendClientSecret string = ''

@description('OIDC Well-Known URL (CIAM: https://{tenant}.ciamlogin.com/{tenantId}/v2.0/.well-known/openid-configuration, Workforce: https://login.microsoftonline.com/{tenantId}/v2.0/.well-known/openid-configuration)')
param oidcWellKnownUrl string = ''

@description('Easy Auth custom provider name')
param easyAuthProviderName string = 'entraid'

@description('Storage account name for Token Store')
param tokenStoreStorageAccountName string = 'st${take(replace(toLower(workloadName), '-', ''), 8)}tokens${take(uniqueString(resourceGroup().id), 4)}'

// Log Analytics Workspace for Container App Environment
module logAnalytics 'modules/log-analytics.bicep' = {
  name: 'log-analytics-deployment'
  params: {
    location: location
    workspaceName: 'law-${workloadName}-${environmentShortName}-${take(uniqueString(resourceGroup().id), 6)}'
  }
}

// Application Insights
module appInsights 'modules/application-insights.bicep' = {
  name: 'appinsights-deployment'
  params: {
    location: location
    appInsightsName: 'appi-${workloadName}-${environmentShortName}'
    logAnalyticsWorkspaceId: logAnalytics.outputs.workspaceId
  }
}

// Container Registry
module containerRegistry 'modules/container-registry.bicep' = {
  name: 'acr-deployment'
  params: {
    location: location
    acrName: containerRegistryName
  }
}

// Container App Environment
module environment 'modules/container-app-environment.bicep' = {
  name: 'environment-deployment'
  params: {
    location: location
    environmentName: environmentName
    logAnalyticsWorkspaceId: logAnalytics.outputs.workspaceId
  }
}

// Token Store Storage (for Easy Auth)
module tokenStoreStorage 'modules/token-store-storage.bicep' = if (enableEasyAuth) {
  name: 'token-store-deployment'
  params: {
    location: location
    storageAccountName: tokenStoreStorageAccountName
  }
}

// Backend Container App
module backendApp 'modules/backend-container-app.bicep' = if (deployContainerApps) {
  name: 'backend-app-deployment'
  params: {
    location: location
    containerAppName: backendAppName
    environmentId: environment.outputs.environmentId
    containerImage: '${containerRegistry.outputs.acrLoginServer}/${backendImageName}:${imageTag}'
    acrName: containerRegistryName
    appInsightsConnectionString: appInsights.outputs.connectionString
    corsAllowedOrigins: corsAllowedOrigins
    corsAllowedOriginSuffixes: corsAllowedOriginSuffixes
    targetPort: 8080
    minReplicas: 1
    maxReplicas: 3
    cpu: '0.5'
    memory: '1.0Gi'
    enableEasyAuth: enableEasyAuth
    easyAuthClientId: easyAuthBackendClientId
    easyAuthClientSecret: easyAuthBackendClientSecret
    oidcWellKnownUrl: oidcWellKnownUrl
    easyAuthProviderName: easyAuthProviderName
  }
}

// Frontend Container App
module frontendApp 'modules/frontend-container-app.bicep' = if (deployContainerApps) {
  name: 'frontend-app-deployment'
  params: {
    location: location
    containerAppName: frontendAppName
    environmentId: environment.outputs.environmentId
    containerImage: '${containerRegistry.outputs.acrLoginServer}/${frontendImageName}:${imageTag}'
    acrName: containerRegistryName
    appInsightsConnectionString: appInsights.outputs.connectionString
    backendApiUrl: deployContainerApps ? backendApp!.outputs.containerAppUrl : ''
    targetPort: 80
    minReplicas: 1
    maxReplicas: 5
    cpu: '0.25'
    memory: '0.5Gi'
    enableEasyAuth: enableEasyAuth
    easyAuthClientId: easyAuthFrontendClientId
    easyAuthClientSecret: easyAuthFrontendClientSecret
    oidcWellKnownUrl: oidcWellKnownUrl
    easyAuthProviderName: easyAuthProviderName
    tokenStoreSasUrl: enableEasyAuth ? tokenStoreStorage!.outputs.tokenStoreSasUrl : ''
    backendApiScope: enableEasyAuth ? 'api://${easyAuthBackendClientId}/.default' : ''
  }
}

// Outputs
output backendAppUrl string = deployContainerApps ? backendApp!.outputs.containerAppUrl : ''
output frontendAppUrl string = deployContainerApps ? frontendApp!.outputs.containerAppUrl : ''
output acrLoginServer string = containerRegistry.outputs.acrLoginServer
output acrName string = containerRegistry.outputs.acrName
output appInsightsConnectionString string = appInsights.outputs.connectionString
output appInsightsName string = appInsights.outputs.appInsightsName
output containerAppEnvironmentName string = environment.outputs.environmentName

