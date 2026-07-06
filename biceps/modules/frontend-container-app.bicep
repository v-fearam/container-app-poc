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
@secure()
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

@description('Easy Auth frontend client ID (App Registration)')
param easyAuthClientId string = ''

@description('Easy Auth client secret')
@secure()
param easyAuthClientSecret string = ''

@description('OIDC Well-Known Configuration URL')
param oidcWellKnownUrl string = ''

@description('Easy Auth provider name')
param easyAuthProviderName string = 'entraid'

@description('Token Store SAS URL for Blob Storage')
@secure()
param tokenStoreSasUrl string = ''

@description('Backend API scope for access token')
param backendApiScope string = ''

@description('Enable Easy Auth')
param enableEasyAuth bool = false

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
      secrets: union(
        [
          {
            name: 'appinsights-connection-string'
            value: appInsightsConnectionString
          }
        ],
        enableEasyAuth ? [
          {
            name: 'microsoft-provider-authentication-secret'
            value: easyAuthClientSecret
          }
          {
            name: 'token-store-sas'
            value: tokenStoreSasUrl
          }
        ] : []
      )
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
              name: 'API_URL'
              value: backendApiUrl
            }
            {
              name: 'APPINSIGHTS_CONNECTION_STRING'
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

resource authConfig 'Microsoft.App/containerApps/authConfigs@2024-03-01' = if (enableEasyAuth) {
  parent: containerApp
  name: 'current'
  properties: {
    platform: {
      enabled: true
    }
    globalValidation: {
      unauthenticatedClientAction: 'RedirectToLoginPage'
      redirectToProvider: easyAuthProviderName
    }
    identityProviders: {
      customOpenIdConnectProviders: {
        '${easyAuthProviderName}': {
          registration: {
            clientId: easyAuthClientId
            clientCredential: {
              clientSecretSettingName: 'microsoft-provider-authentication-secret'
            }
            openIdConnectConfiguration: {
              wellKnownOpenIdConfiguration: oidcWellKnownUrl
            }
          }
          login: {
            scopes: union(['openid', 'profile', 'email'], empty(backendApiScope) ? [] : [backendApiScope])
          }
        }
      }
    }
    login: {
      preserveUrlFragmentsForLogins: false
      tokenStore: {
        enabled: true
        azureBlobStorage: {
          sasUrlSettingName: 'token-store-sas'
        }
      }
    }
  }
}

output containerAppUrl string = 'https://${containerApp.properties.configuration.ingress.fqdn}'
output containerAppFqdn string = containerApp.properties.configuration.ingress.fqdn
output containerAppId string = containerApp.id
