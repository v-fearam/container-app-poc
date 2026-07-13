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
param backendImageName string = 'weather-api'

@description('The frontend image name in ACR')
param frontendImageName string = 'weather-frontend'

@description('The tag for the container images')
param imageTag string = 'latest'

@description('Deploy Container Apps in this run')
param deployContainerApps bool = true

@description('Comma-separated explicit CORS origins allowed by backend API')
param corsAllowedOrigins string = 'http://localhost:5173,http://localhost:3000'

@description('Comma-separated host suffixes allowed for CORS origins')
param corsAllowedOriginSuffixes string = '.azurecontainerapps.io'

@description('Deploy the worker and Service Bus infrastructure')
param deployWorker bool = true

@description('Deploy the worker Container App (requires worker image in ACR)')
param deployWorkerApp bool = false

@description('The worker image name in ACR')
param workerImageName string = 'weather-worker'

@description('The name of the Worker Container App')
param workerAppName string = 'ca-${workloadName}-worker-${environmentShortName}'

@description('Service Bus namespace name')
param serviceBusNamespaceName string = 'sb-${workloadName}-${environmentShortName}-${take(uniqueString(resourceGroup().id), 6)}'

@description('Managed identity name for worker')
param workerIdentityName string = 'id-${workloadName}-worker-${environmentShortName}'

@description('Deploy Dashboard infrastructure (SQL Database)')
param deployDashboard bool = false

@description('SQL Server location (defaults to resource group location if not specified)')
param sqlLocation string = location

@description('SQL Server name (required if deployDashboard=true)')
param sqlServerName string = ''

@description('Entra ID admin object ID for SQL Server (required if deployDashboard=true)')
param sqlAdminObjectId string = ''

@description('Entra ID admin login (UPN) for SQL Server (required if deployDashboard=true)')
param sqlAdminLogin string = ''

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
    appInsightsConnectionString: appInsights.outputs.connectionString
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
  }
}

// =============================================================================
// Worker Infrastructure (Service Bus + Managed Identity + Worker Container App)
// =============================================================================

// Service Bus Namespace + Queue
module serviceBus 'modules/service-bus.bicep' = if (deployWorker) {
  name: 'service-bus-deployment'
  params: {
    location: location
    namespaceName: serviceBusNamespaceName
  }
}

// Managed Identity for Worker (Service Bus Data Receiver + Sender + AcrPull)
module workerIdentity 'modules/managed-identity.bicep' = if (deployWorker) {
  name: 'worker-identity-deployment'
  params: {
    location: location
    identityName: workerIdentityName
    serviceBusNamespaceId: deployWorker ? serviceBus!.outputs.namespaceId : ''
    acrName: containerRegistryName
  }
}

// Worker Container App (scale-to-zero with KEDA)
module workerApp 'modules/worker-container-app.bicep' = if (deployWorker && deployWorkerApp && deployContainerApps) {
  name: 'worker-app-deployment'
  params: {
    location: location
    containerAppName: workerAppName
    environmentId: environment.outputs.environmentId
    containerImage: '${containerRegistry.outputs.acrLoginServer}/${workerImageName}:${imageTag}'
    acrName: containerRegistryName
    managedIdentityId: deployWorker ? workerIdentity!.outputs.identityId : ''
    managedIdentityClientId: deployWorker ? workerIdentity!.outputs.identityClientId : ''
    serviceBusNamespaceFqdn: deployWorker ? serviceBus!.outputs.namespaceFqdn : ''
    serviceBusQueueName: 'weather-jobs'
    appInsightsConnectionString: appInsights.outputs.connectionString
    minReplicas: 0
    maxReplicas: 10
    cpu: '0.5'
    memory: '1.0Gi'
  }
}

// =============================================================================
// Dashboard Infrastructure (SQL Database)
// =============================================================================

// Azure SQL Database for Dashboard counters and health
module sqlDatabase 'modules/sql-database.bicep' = if (deployDashboard) {
  name: 'sql-database-deployment'
  params: {
    location: sqlLocation
    serverName: sqlServerName
    databaseName: 'dashboard-poc'
    entraAdminObjectId: sqlAdminObjectId
    entraAdminLogin: sqlAdminLogin
    tags: {
      workload: workloadName
      environment: environmentShortName
    }
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
output containerAppEnvironmentId string = environment.outputs.environmentId
output serviceBusNamespaceFqdn string = deployWorker ? serviceBus!.outputs.namespaceFqdn : ''
output workerIdentityClientId string = deployWorker ? workerIdentity!.outputs.identityClientId : ''
output workerIdentityName string = deployWorker ? workerIdentity!.outputs.identityName : ''
output workerIdentityPrincipalId string = deployWorker ? workerIdentity!.outputs.identityPrincipalId : ''
output workerIdentityId string = deployWorker ? workerIdentity!.outputs.identityId : ''
output sqlServerFqdn string = deployDashboard ? sqlDatabase!.outputs.sqlServerFqdn : ''
output sqlDatabaseName string = deployDashboard ? sqlDatabase!.outputs.databaseName : ''
output sqlConnectionString string = deployDashboard ? sqlDatabase!.outputs.connectionString : ''

