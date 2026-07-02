targetScope = 'resourceGroup'

@description('The location for all resources')
param location string = resourceGroup().location

@description('The name of the Container App Environment')
param environmentName string = 'cae-easyauth-${uniqueString(resourceGroup().id)}'

@description('The name of the Container App')
param containerAppName string = 'ca-easyauth-demo'

@description('The name of the Container Registry')
param containerRegistryName string = 'acr${uniqueString(resourceGroup().id)}'

@description('The name of the image in ACR (without registry prefix)')
param acrImageName string = 'aspnetapp'

@description('The tag for the container image')
param acrImageTag string = 'latest'

// Log Analytics Workspace for Container App Environment
module logAnalytics 'modules/log-analytics.bicep' = {
  name: 'log-analytics-deployment'
  params: {
    location: location
    workspaceName: 'log-${environmentName}'
  }
}

// Application Insights
module appInsights 'modules/application-insights.bicep' = {
  name: 'appinsights-deployment'
  params: {
    location: location
    appInsightsName: 'appi-${containerAppName}'
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

// Container App
module containerApp 'modules/container-app.bicep' = {
  name: 'container-app-deployment'
  params: {
    location: location
    containerAppName: containerAppName
    environmentId: environment.outputs.environmentId
    containerImage: '${containerRegistry.outputs.acrLoginServer}/${acrImageName}:${acrImageTag}'
    acrName: containerRegistryName
    useAcrImage: true
    appInsightsConnectionString: appInsights.outputs.connectionString
  }
}

// Outputs
output containerAppUrl string = containerApp.outputs.containerAppUrl
output containerAppFqdn string = containerApp.outputs.containerAppFqdn
output acrLoginServer string = containerRegistry.outputs.acrLoginServer
output acrName string = containerRegistry.outputs.acrName
output appInsightsConnectionString string = appInsights.outputs.connectionString
output appInsightsName string = appInsights.outputs.appInsightsName
