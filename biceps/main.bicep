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

@description('Deploy Dashboard Worker Container App (requires DashboardWorker image in ACR)')
param deployDashboardWorkerApp bool = false

@description('Dashboard Worker image name in ACR')
param dashboardWorkerImageName string = 'dashboard-worker'

@description('Service Bus namespace name')
param serviceBusNamespaceName string = 'sb-${workloadName}-${environmentShortName}-${take(uniqueString(resourceGroup().id), 6)}'

@description('Managed identity name for worker')
param workerIdentityName string = 'id-${workloadName}-worker-${environmentShortName}'

@description('Deploy Dashboard infrastructure (SQL Database)')
param deployDashboard bool = false

@description('SQL Server location (defaults to resource group location if not specified)')
param sqlLocation string = location

@description('SQL Server name (required if deployDashboard=true)')
param sqlServerName string = 'sql-${workloadName}-dash-${take(uniqueString(resourceGroup().id), 6)}'

@description('Entra ID admin object ID for SQL Server (required if deployDashboard=true)')
param sqlAdminObjectId string = ''

@description('Entra ID admin login (UPN) for SQL Server (required if deployDashboard=true)')
param sqlAdminLogin string = ''

@description('Deploy Key Vault for centralized secrets')
param deployKeyVault bool = true

@description('Key Vault name')
param keyVaultName string = 'kv-${workloadName}-${environmentShortName}-${take(uniqueString(resourceGroup().id), 6)}'

@description('Deploy Cosmos DB for Change Feed POC')
param deployCosmosDB bool = false

@description('Cosmos DB account name')
param cosmosAccountName string = 'cosmos-${workloadName}-${environmentShortName}-${take(uniqueString(resourceGroup().id), 6)}'

@description('Cosmos DB database name')
param cosmosDatabaseName string = 'change-feed-poc'

@description('Deploy Change Feed Worker Container App (requires ChangeFeedWorker image in ACR and Cosmos DB)')
param deployChangeFeedWorker bool = false

@description('Change Feed Worker image name in ACR')
param changeFeedWorkerImageName string = 'changefeed-worker'

@description('Cosmos collection to monitor (POC: personas, PROD: configurable per vertical)')
param cosmosCollection string = 'personas'

@description('Change Feed Processor name (unique per vertical)')
param processorName string = 'cfp-personas'

@description('Vertical name for telemetry')
param verticalName string = 'personas'

@description('Deploy Container Apps Jobs infrastructure and WeatherEnqueuer job')
param deployJob bool = false

@description('WeatherEnqueuer Job image name in ACR')
param jobImageName string = 'weather-enqueuer'

@description('Number of messages to enqueue per job execution')
param jobMessageCount string = '50'

@description('Job CRON expression (default: every 5 minutes)')
param jobCronExpression string = '*/5 * * * *'

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

// Key Vault for centralized secrets
// NOTE: Deployed after App Insights so we can seed the connection string.
// Container Apps depend on KV being ready (they reference secrets via keyVaultUrl).
module keyVault 'modules/key-vault.bicep' = if (deployKeyVault) {
  name: 'key-vault-deployment'
  params: {
    location: location
    keyVaultName: keyVaultName
    secretUserPrincipalIds: []
    appInsightsConnectionString: appInsights.outputs.connectionString
    tags: {
      workload: workloadName
      environment: environmentShortName
    }
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
    keyVaultUri: deployKeyVault ? keyVault!.outputs.keyVaultUri : ''
    keyVaultName: deployKeyVault ? keyVault!.outputs.keyVaultName : ''
    corsAllowedOrigins: corsAllowedOrigins
    corsAllowedOriginSuffixes: corsAllowedOriginSuffixes
    targetPort: 8080
    minReplicas: 1
    maxReplicas: 3
    cpu: '0.5'
    memory: '1.0Gi'
    sqlConnectionString: deployDashboard ? sqlDatabase!.outputs.connectionStringWithMI : ''
    cosmosAccountId: deployCosmosDB ? cosmosDB!.outputs.accountId : ''
    cosmosEndpoint: deployCosmosDB ? cosmosDB!.outputs.endpoint : ''
    serviceBusNamespaceFqdn: (deployWorker || deployDashboard) ? serviceBus!.outputs.namespaceFqdn : ''
    serviceBusNamespaceId: (deployWorker || deployDashboard) ? serviceBus!.outputs.namespaceId : ''
    enableAuth: true
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
    keyVaultUri: deployKeyVault ? keyVault!.outputs.keyVaultUri : ''
    keyVaultName: deployKeyVault ? keyVault!.outputs.keyVaultName : ''
    backendApiUrl: deployContainerApps ? backendApp!.outputs.containerAppUrl : ''
    targetPort: 80
    minReplicas: 1
    maxReplicas: 5
    cpu: '0.25'
    memory: '0.5Gi'
    enableAuth: true
    enableTokenStore: true
  }
}

// =============================================================================
// Worker Infrastructure (Service Bus + Managed Identity + Worker Container App)
// =============================================================================

// Service Bus Namespace + Queue + Dashboard Topic
module serviceBus 'modules/service-bus.bicep' = if (deployWorker || deployDashboard) {
  name: 'service-bus-deployment'
  params: {
    location: location
    namespaceName: serviceBusNamespaceName
    logAnalyticsWorkspaceId: logAnalytics.outputs.workspaceId
  }
}

// Managed Identity for Worker (Service Bus Data Receiver + Sender + AcrPull + KV Secrets User)
module workerIdentity 'modules/managed-identity.bicep' = if (deployWorker || deployDashboard) {
  name: 'worker-identity-deployment'
  params: {
    location: location
    identityName: workerIdentityName
    serviceBusNamespaceId: (deployWorker || deployDashboard) ? serviceBus!.outputs.namespaceId : ''
    acrName: containerRegistryName
    keyVaultName: deployKeyVault ? keyVault!.outputs.keyVaultName : ''
  }
}

// Cosmos DB (Serverless) for Change Feed POC
module cosmosDB 'modules/cosmos-db.bicep' = if (deployCosmosDB) {
  name: 'cosmos-db-deployment'
  params: {
    location: location
    cosmosAccountName: cosmosAccountName
    databaseName: cosmosDatabaseName
    dataContributorPrincipalId: (deployWorker || deployDashboard) ? workerIdentity!.outputs.identityPrincipalId : ''
    tags: {
      workload: workloadName
      environment: environmentShortName
    }
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
    keyVaultUri: deployKeyVault ? keyVault!.outputs.keyVaultUri : ''
    minReplicas: 0
    maxReplicas: 10
    cpu: '0.5'
    memory: '1.0Gi'
  }
}

// Dashboard Worker Container App (KEDA scale-to-zero on topic subscription)
module dashboardWorkerApp 'modules/dashboard-worker-container-app.bicep' = if (deployDashboardWorkerApp && deployDashboard && deployContainerApps) {
  name: 'dashboard-worker-deployment'
  params: {
    location: location
    containerAppName: 'ca-${workloadName}-dashworker-${environmentShortName}'
    environmentId: environment.outputs.environmentId
    containerImage: '${containerRegistry.outputs.acrLoginServer}/${dashboardWorkerImageName}:${imageTag}'
    acrName: containerRegistryName
    managedIdentityId: workerIdentity!.outputs.identityId
    managedIdentityClientId: workerIdentity!.outputs.identityClientId
    serviceBusNamespaceFqdn: serviceBus!.outputs.namespaceFqdn
    topicName: 'nd-dashboard-events'
    subscriptionName: 'counter-updater'
    sqlConnectionString: 'Server=${sqlDatabase!.outputs.sqlServerFqdn};Database=${sqlDatabase!.outputs.databaseName};Authentication=Active Directory Default'
    appInsightsConnectionString: appInsights.outputs.connectionString
    keyVaultUri: deployKeyVault ? keyVault!.outputs.keyVaultUri : ''
    minReplicas: 0  // Scale to zero when no messages
    maxReplicas: 10
    cpu: '0.5'
    memory: '1.0Gi'
  }
}

// Change Feed Worker Container App (fixed replicas, no scale-to-zero)
module changeFeedWorkerApp 'modules/changefeed-worker-container-app.bicep' = if (deployChangeFeedWorker && deployCosmosDB && deployDashboard && deployContainerApps) {
  name: 'changefeed-worker-deployment'
  params: {
    location: location
    containerAppName: 'ca-${workloadName}-cfworker-${environmentShortName}'
    environmentId: environment.outputs.environmentId
    containerImage: '${containerRegistry.outputs.acrLoginServer}/${changeFeedWorkerImageName}:${imageTag}'
    acrName: containerRegistryName
    managedIdentityId: workerIdentity!.outputs.identityId
    managedIdentityClientId: workerIdentity!.outputs.identityClientId
    cosmosEndpoint: cosmosDB!.outputs.endpoint
    cosmosDatabase: cosmosDatabaseName
    cosmosCollection: cosmosCollection
    processorName: processorName
    verticalName: verticalName
    serviceBusNamespaceFqdn: serviceBus!.outputs.namespaceFqdn
    dashboardTopicName: 'nd-dashboard-events'
    sqlConnectionString: 'Server=${sqlDatabase!.outputs.sqlServerFqdn};Database=${sqlDatabase!.outputs.databaseName};Authentication=Active Directory Default'
    appInsightsConnectionString: appInsights.outputs.connectionString
    keyVaultUri: deployKeyVault ? keyVault!.outputs.keyVaultUri : ''
    minReplicas: 1  // No scale to zero — avoid lease rebalancing lag
    maxReplicas: 1  // POC: 1 replica. PROD: set to number of physical partitions
    cpu: '0.5'
    memory: '1.0Gi'
  }
}

// =============================================================================
// Container Apps Jobs - WeatherEnqueuer Scheduled Job
// =============================================================================

module weatherEnqueuerJob 'modules/container-app-job.bicep' = if (deployJob && deployWorker && deployDashboard && deployContainerApps) {
  name: 'weather-enqueuer-job-deployment'
  params: {
    location: location
    jobName: 'ca-${workloadName}-enqueuer-${environmentShortName}'
    environmentId: environment.outputs.environmentId
    containerImage: '${containerRegistry.outputs.acrLoginServer}/${jobImageName}:${imageTag}'
    acrName: containerRegistryName
    managedIdentityId: workerIdentity!.outputs.identityId
    managedIdentityClientId: workerIdentity!.outputs.identityClientId
    serviceBusNamespaceFqdn: serviceBus!.outputs.namespaceFqdn
    weatherQueueName: 'weather-jobs'
    dashboardTopicName: 'nd-dashboard-events'
    messageCount: jobMessageCount
    keyVaultUri: deployKeyVault ? keyVault!.outputs.keyVaultUri : ''
    cronExpression: jobCronExpression
    replicaTimeout: 300    // 5 minutes max execution time
    replicaRetryLimit: 2   // Retry up to 2 times on failure
    triggerType: 'Schedule'
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
    sqlAdminPassword: 'P@ssw0rd-${uniqueString(resourceGroup().id, sqlServerName)}'
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
output cosmosEndpoint string = deployCosmosDB ? cosmosDB!.outputs.endpoint : ''
output cosmosAccountName string = deployCosmosDB ? cosmosDB!.outputs.accountName : ''
output jobName string = deployJob ? weatherEnqueuerJob!.outputs.jobName : ''
output cosmosDatabaseName string = deployCosmosDB ? cosmosDB!.outputs.databaseName : ''
output dashboardWorkerAppName string = deployDashboardWorkerApp ? dashboardWorkerApp!.outputs.containerAppName : ''
output changeFeedWorkerAppName string = deployChangeFeedWorker ? changeFeedWorkerApp!.outputs.containerAppName : ''
output keyVaultName string = deployKeyVault ? keyVault!.outputs.keyVaultName : ''
output keyVaultUri string = deployKeyVault ? keyVault!.outputs.keyVaultUri : ''

