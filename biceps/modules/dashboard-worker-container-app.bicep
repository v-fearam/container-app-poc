targetScope = 'resourceGroup'

@description('Location for Container App')
param location string = resourceGroup().location

@description('Dashboard Worker Container App name')
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

@description('Service Bus namespace FQDN (e.g., myns.servicebus.windows.net)')
param serviceBusNamespaceFqdn string

@description('Service Bus topic name')
param topicName string = 'nd-dashboard-events'

@description('Service Bus subscription name')
param subscriptionName string = 'counter-updater'

@description('SQL Database connection string')
@secure()
param sqlConnectionString string

@description('App Insights connection string')
param appInsightsConnectionString string = ''

@description('KEDA: messages per replica')
param kedaMessageCount string = '15'

@description('Minimum replicas (0 = scale to zero)')
param minReplicas int = 0

@description('Maximum replicas')
param maxReplicas int = 10

@description('CPU cores')
param cpu string = '0.5'

@description('Memory')
param memory string = '1.0Gi'

// Reference ACR for credentials
resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: acrName
}

resource dashboardWorkerApp 'Microsoft.App/containerApps@2024-10-02-preview' = {
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
    }
    template: {
      containers: [
        {
          name: 'dashboard-worker'
          image: containerImage
          resources: {
            cpu: json(cpu)
            memory: memory
          }
          env: [
            { name: 'ServiceBus__Namespace', value: serviceBusNamespaceFqdn }
            { name: 'ServiceBus__TopicName', value: topicName }
            { name: 'ServiceBus__SubscriptionName', value: subscriptionName }
            { name: 'Sql__ConnectionString', value: sqlConnectionString }
            { name: 'AZURE_CLIENT_ID', value: managedIdentityClientId }
            { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsightsConnectionString }
          ]
        }
      ]
      scale: {
        minReplicas: minReplicas
        maxReplicas: maxReplicas
        rules: [
          {
            name: 'servicebus-topic-subscription-length'
            custom: {
              type: 'azure-servicebus'
              metadata: {
                topicName: topicName
                subscriptionName: subscriptionName
                namespace: replace(serviceBusNamespaceFqdn, '.servicebus.windows.net', '')
                messageCount: kedaMessageCount
              }
              #disable-next-line BCP037
              identity: managedIdentityId
            }
          }
        ]
      }
    }
  }
}

output containerAppName string = dashboardWorkerApp.name
