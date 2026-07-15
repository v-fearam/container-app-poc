targetScope = 'resourceGroup'

@description('The location for the Container App')
param location string

@description('The name of the Backend Container App')
param containerAppName string

@description('The Container App Environment ID')
param environmentId string

@description('The backend container image')
param containerImage string

@description('The Container Registry name')
param acrName string

@description('Key Vault URI (e.g., https://kv-weather-dev.vault.azure.net/)')
param keyVaultUri string

@description('Key Vault name for role assignment')
param keyVaultName string = ''

@description('Comma-separated explicit CORS origins allowed by backend API')
param corsAllowedOrigins string = 'http://localhost:5173,http://localhost:3000'

@description('Comma-separated host suffixes allowed for CORS origins')
param corsAllowedOriginSuffixes string = '.azurecontainerapps.io'

@description('Whether SQL connection string secret exists in Key Vault')
param enableSql bool = false

@description('Optional Service Bus namespace FQDN for Dashboard features')
param serviceBusNamespaceFqdn string = ''

@description('Whether Easy Auth client secret exists in Key Vault')
param enableAuth bool = false

@description('Optional Service Bus namespace resource ID for role assignment')
param serviceBusNamespaceId string = ''

@description('Target port for the container')
param targetPort int = 8080

@description('Minimum replicas')
param minReplicas int = 1

@description('Maximum replicas')
param maxReplicas int = 3

@description('CPU cores')
param cpu string = '0.5'

@description('Memory size')
param memory string = '1.0Gi'

@description('Timestamp for unique revision suffix')
param timestamp string = utcNow()

resource containerRegistry 'Microsoft.ContainerRegistry/registries@2026-01-01-preview' existing = {
  name: acrName
}

resource userAssignedIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'uami-${containerAppName}'
  location: location
}

resource acrPullRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(userAssignedIdentity.id, containerRegistry.id, 'AcrPull')
  scope: containerRegistry
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d') // AcrPull
    principalId: userAssignedIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// Service Bus Data Owner role for DLQ management (peek, requeue, discard) and admin queries
resource serviceBusOwnerRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(serviceBusNamespaceId)) {
  name: guid(userAssignedIdentity.id, serviceBusNamespaceId, 'ServiceBusDataOwner')
  scope: serviceBusNamespace
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '090c5cfd-751d-490a-894a-3ce6f1109419') // Azure Service Bus Data Owner
    principalId: userAssignedIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource serviceBusNamespace 'Microsoft.ServiceBus/namespaces@2022-10-01-preview' existing = if (!empty(serviceBusNamespaceId)) {
  name: last(split(serviceBusNamespaceId, '/'))
}

// Key Vault Secrets User role for reading secrets via keyVaultUrl references
resource kvExisting 'Microsoft.KeyVault/vaults@2023-07-01' existing = if (!empty(keyVaultName)) {
  name: keyVaultName
}

resource kvSecretsUserRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(keyVaultName)) {
  name: guid(userAssignedIdentity.id, kvExisting.id, 'KeyVaultSecretsUser')
  scope: kvExisting
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6')
    principalId: userAssignedIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// Reader role on resource group for ARM API queries (list container apps, replicas)
resource rgReaderRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(userAssignedIdentity.id, resourceGroup().id, 'Reader')
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'acdd72a7-3385-48ef-bd42-f606fba81ae7')
    principalId: userAssignedIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource containerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: containerAppName
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${userAssignedIdentity.id}': {}
    }
  }
  dependsOn: [
    acrPullRole
  ]
  properties: {
    environmentId: environmentId
    configuration: {
      ingress: {
        external: true
        targetPort: targetPort
        transport: 'http'
        allowInsecure: false
        corsPolicy: {
          allowedOrigins: ['https://*']
          allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
          allowedHeaders: ['*']
          allowCredentials: true
        }
      }
      registries: [
        {
          server: '${acrName}.azurecr.io'
          identity: userAssignedIdentity.id
        }
      ]
      secrets: union(
        [
          {
            name: 'appinsights-connection-string'
            keyVaultUrl: '${keyVaultUri}secrets/appinsights-connection-string'
            identity: userAssignedIdentity.id
          }
        ],
        enableSql ? [
          {
            name: 'sql-connection-string'
            keyVaultUrl: '${keyVaultUri}secrets/sql-connection-string'
            identity: userAssignedIdentity.id
          }
        ] : [],
        enableAuth ? [
          {
            name: 'microsoft-provider-authentication-secret'
            keyVaultUrl: '${keyVaultUri}secrets/auth-client-secret-backend'
            identity: userAssignedIdentity.id
          }
        ] : []
      )
    }
    template: {
      revisionSuffix: 't${uniqueString(timestamp)}'
      containers: [
        {
          name: containerAppName
          image: containerImage
          resources: {
            cpu: json(cpu)
            memory: memory
          }
          env: union(
            [
              {
                name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
                secretRef: 'appinsights-connection-string'
              }
              {
                name: 'ASPNETCORE_ENVIRONMENT'
                value: 'Production'
              }
              {
                name: 'CORS_ALLOWED_ORIGINS'
                value: corsAllowedOrigins
              }
              {
                name: 'CORS_ALLOWED_ORIGIN_SUFFIXES'
                value: corsAllowedOriginSuffixes
              }
            ],
            enableSql ? [
              {
                name: 'SQL_CONNECTION_STRING'
                secretRef: 'sql-connection-string'
              }
            ] : [],
            !empty(serviceBusNamespaceFqdn) ? [
              {
                name: 'ServiceBus__Namespace'
                value: serviceBusNamespaceFqdn
              }
            ] : [],
            !empty(serviceBusNamespaceFqdn) || enableSql ? [
              {
                name: 'AZURE_CLIENT_ID'
                value: userAssignedIdentity.properties.clientId
              }
            ] : [],
            [
              {
                name: 'AZURE_SUBSCRIPTION_ID'
                value: subscription().subscriptionId
              }
              {
                name: 'AZURE_RESOURCE_GROUP'
                value: resourceGroup().name
              }
            ]
          )
        }
      ]
      scale: {
        minReplicas: minReplicas
        maxReplicas: maxReplicas
        rules: [
          {
            name: 'http-rule'
            http: {
              metadata: {
                concurrentRequests: '10'
              }
            }
          }
        ]
      }
    }
  }
}

output containerAppUrl string = 'https://${containerApp.properties.configuration.ingress.fqdn}'
output containerAppFqdn string = containerApp.properties.configuration.ingress.fqdn
output containerAppId string = containerApp.id
