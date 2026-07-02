targetScope = 'resourceGroup'

@description('The location for the Container App')
param location string

@description('The name of the Frontend Container App')
param containerAppName string

@description('The Container App Environment ID')
param environmentId string

@description('The frontend container image')
param containerImage string

@description('The Container Registry name')
param acrName string

@description('Application Insights Connection String')
param appInsightsConnectionString string

@description('Backend API URL')
param backendApiUrl string

@description('Target port for the container')
param targetPort int = 80

@description('Minimum replicas')
param minReplicas int = 1

@description('Maximum replicas')
param maxReplicas int = 5

@description('CPU cores')
param cpu string = '0.25'

@description('Memory size')
param memory string = '0.5Gi'

resource containerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: containerAppName
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    environmentId: environmentId
    configuration: {
      ingress: {
        external: true
        targetPort: targetPort
        transport: 'http'
        allowInsecure: false
      }
      registries: [
        {
          server: '${acrName}.azurecr.io'
          identity: 'system'
        }
      ]
      secrets: [
        {
          name: 'appinsights-connection-string'
          value: appInsightsConnectionString
        }
      ]
    }
    template: {
      containers: [
        {
          name: containerAppName
          image: containerImage
          resources: {
            cpu: json(cpu)
            memory: memory
          }
          env: [
            {
              name: 'VITE_API_URL'
              value: backendApiUrl
            }
            {
              name: 'VITE_APPINSIGHTS_CONNECTION_STRING'
              secretRef: 'appinsights-connection-string'
            }
          ]
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
                concurrentRequests: '20'
              }
            }
          }
        ]
      }
    }
  }
}

// Assign AcrPull role to Container App's managed identity
resource acrPullRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(containerApp.id, 'acrPull')
  scope: resourceGroup()
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d') // AcrPull
    principalId: containerApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

output containerAppUrl string = 'https://${containerApp.properties.configuration.ingress.fqdn}'
output containerAppFqdn string = containerApp.properties.configuration.ingress.fqdn
output containerAppId string = containerApp.id
