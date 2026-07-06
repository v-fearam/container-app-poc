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

@description('Application Insights Connection String')
@secure()
param appInsightsConnectionString string

@description('Comma-separated explicit CORS origins allowed by backend API')
param corsAllowedOrigins string = 'http://localhost:5173,http://localhost:3000'

@description('Comma-separated host suffixes allowed for CORS origins')
param corsAllowedOriginSuffixes string = '.azurecontainerapps.io'

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
      }
      registries: [
        {
          server: '${acrName}.azurecr.io'
          identity: userAssignedIdentity.id
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
