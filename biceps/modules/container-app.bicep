@description('The location for the Container App')
param location string

@description('The name of the Container App')
param containerAppName string

@description('The resource ID of the Container App Environment')
param environmentId string

@description('The container image to use')
param containerImage string

@description('The name of the Container Registry')
param acrName string

@description('Use ACR image instead of public image')
param useAcrImage bool = false

@description('Application Insights connection string')
param appInsightsConnectionString string = ''

resource containerRegistry 'Microsoft.ContainerRegistry/registries@2026-01-01-preview' existing = if (useAcrImage) {
  name: acrName
}

resource containerApp 'Microsoft.App/containerApps@2026-01-01' = {
  name: containerAppName
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    managedEnvironmentId: environmentId
    configuration: {
      ingress: {
        external: true
        targetPort: 8080
        transport: 'auto'
        allowInsecure: false
      }
      registries: useAcrImage ? [
        {
          server: containerRegistry!.properties.loginServer
          identity: 'system'
        }
      ] : []
      secrets: !empty(appInsightsConnectionString) ? [
        {
          name: 'appinsights-connection-string'
          value: appInsightsConnectionString
        }
      ] : []
    }
    template: {
      containers: [
        {
          name: 'app'
          image: containerImage
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          env: !empty(appInsightsConnectionString) ? [
            {
              name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
              secretRef: 'appinsights-connection-string'
            }
          ] : []
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 3
      }
    }
  }
}

// Assign AcrPull role to the Container App's managed identity if using ACR
resource acrPullRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (useAcrImage) {
  name: guid(containerApp.id, containerRegistry.id, 'AcrPull')
  scope: containerRegistry
  properties: {
    principalId: containerApp.identity.principalId
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d') // AcrPull role
    principalType: 'ServicePrincipal'
  }
}

output containerAppUrl string = 'https://${containerApp.properties.configuration.ingress.fqdn}'
output containerAppFqdn string = containerApp.properties.configuration.ingress.fqdn
output containerAppId string = containerApp.id
output containerAppPrincipalId string = containerApp.identity.principalId
