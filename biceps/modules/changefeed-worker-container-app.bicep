targetScope = 'resourceGroup'

@description('Location for Container App')
param location string = resourceGroup().location

@description('Change Feed Worker Container App name')
param containerAppName string

@description('Container App Environment ID')
param environmentId string

@description('Container image (full ACR path)')
param containerImage string

@description('ACR name for admin credentials')
param acrName string

@description('User Assigned Managed Identity resource ID')
param managedIdentityId string

@description('User Assigned Managed Identity client ID')
param managedIdentityClientId string

@description('Cosmos DB endpoint (e.g., https://myaccount.documents.azure.com:443/)')
param cosmosEndpoint string

@description('Cosmos DB database name')
param cosmosDatabase string = 'change-feed-poc'

@description('Cosmos DB collection to monitor (configurable per vertical in production)')
param cosmosCollection string = 'personas'

@description('Change Feed Processor name (unique per vertical)')
param processorName string = 'cfp-personas'

@description('Vertical name for telemetry and events')
param verticalName string = 'personas'

@description('Service Bus namespace FQDN (e.g., myns.servicebus.windows.net)')
param serviceBusNamespaceFqdn string

@description('Service Bus dashboard topic name')
param dashboardTopicName string = 'nd-dashboard-events'

@description('SQL Database connection string (used only if keyVaultUri is empty)')
param sqlConnectionString string = ''

@description('App Insights connection string (used only if keyVaultUri is empty)')
param appInsightsConnectionString string = ''

@description('Key Vault URI for secrets (if provided, secrets are fetched from KV)')
param keyVaultUri string = ''

@description('Minimum replicas (1 = no scale to zero, recommended for Change Feed to avoid rebalancing lag)')
param minReplicas int = 1

@description('Maximum replicas (should match number of physical partitions in Cosmos)')
param maxReplicas int = 1

@description('CPU cores')
param cpu string = '0.5'

@description('Memory')
param memory string = '1.0Gi'

// Reference ACR for credentials
resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: acrName
}

resource changeFeedWorkerApp 'Microsoft.App/containerApps@2024-10-02-preview' = {
  name: containerAppName
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${managedIdentityId}': {}
    }
  }
  properties: {
    environmentId: environmentId
    configuration: {
      // No ingress — worker does not receive HTTP traffic
      activeRevisionsMode: 'Single'
      registries: [
        {
          server: acr.properties.loginServer
          identity: managedIdentityId
        }
      ]
      secrets: !empty(keyVaultUri) ? [
        {
          name: 'sql-connection-string'
          keyVaultUrl: '${keyVaultUri}secrets/sql-connection-string'
          identity: managedIdentityId
        }
        {
          name: 'appinsights-connection-string'
          keyVaultUrl: '${keyVaultUri}secrets/appinsights-connection-string'
          identity: managedIdentityId
        }
      ] : []
    }
    template: {
      containers: [
        {
          name: 'changefeed-worker'
          image: containerImage
          resources: {
            cpu: json(cpu)
            memory: memory
          }
          env: [
            // Cosmos configuration (PRODUCTION: override these for each vertical)
            { name: 'Cosmos__Endpoint', value: cosmosEndpoint }
            { name: 'Cosmos__Database', value: cosmosDatabase }
            { name: 'Cosmos__Collection', value: cosmosCollection }
            { name: 'Cosmos__ProcessorName', value: processorName }
            { name: 'Cosmos__VerticalName', value: verticalName }
            
            // Service Bus configuration
            { name: 'ServiceBus__Namespace', value: serviceBusNamespaceFqdn }
            { name: 'ServiceBus__DashboardTopic', value: dashboardTopicName }
            
            // Managed Identity
            { name: 'AZURE_CLIENT_ID', value: managedIdentityClientId }
            
            // SQL connection (from Key Vault or direct)
            !empty(keyVaultUri) ? {
              name: 'Sql__ConnectionString'
              secretRef: 'sql-connection-string'
            } : {
              name: 'Sql__ConnectionString'
              value: sqlConnectionString
            }
            
            // App Insights (from Key Vault or direct)
            !empty(keyVaultUri) ? {
              name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
              secretRef: 'appinsights-connection-string'
            } : {
              name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
              value: appInsightsConnectionString
            }
          ]
        }
      ]
      scale: {
        // IMPORTANT: min=max=1 for POC (no KEDA scaler for Change Feed)
        // Production: Set max = number of physical partitions in Cosmos collection
        // Never scale to zero — lease rebalancing takes ~77 seconds causing lag
        minReplicas: minReplicas
        maxReplicas: maxReplicas
      }
    }
  }
}

output containerAppName string = changeFeedWorkerApp.name
output containerAppFqdn string = changeFeedWorkerApp.properties.configuration.ingress != null ? changeFeedWorkerApp.properties.configuration.ingress.fqdn : ''
