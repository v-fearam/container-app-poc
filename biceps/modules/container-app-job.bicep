targetScope = 'resourceGroup'

@description('Location for Container App Job')
param location string = resourceGroup().location

@description('Container App Job name')
param jobName string

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

@description('Service Bus queue name for weather messages')
param weatherQueueName string = 'weather-queue'

@description('Service Bus topic name for dashboard events')
param dashboardTopicName string = 'dashboard-events'

@description('Number of messages to enqueue per execution')
param messageCount string = '50'

@description('App Insights connection string')
param appInsightsConnectionString string = ''

@description('Key Vault URI for secrets (if provided, appInsightsConnectionString from KV is used)')
param keyVaultUri string = ''

@description('CRON schedule expression (default: every 5 minutes)')
param cronExpression string = '*/5 * * * *'

@description('Replica timeout in seconds (job execution timeout)')
param replicaTimeout int = 300

@description('Number of retries on failure')
param replicaRetryLimit int = 2

@description('Trigger type: Schedule or Manual')
@allowed([
  'Schedule'
  'Manual'
])
param triggerType string = 'Schedule'

@description('CPU cores')
param cpu string = '0.5'

@description('Memory')
param memory string = '1.0Gi'

// Reference ACR for credentials
resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: acrName
}

resource containerAppJob 'Microsoft.App/jobs@2024-10-02-preview' = {
  name: jobName
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
      replicaTimeout: replicaTimeout
      replicaRetryLimit: replicaRetryLimit
      triggerType: triggerType
      scheduleTriggerConfig: triggerType == 'Schedule' ? {
        cronExpression: cronExpression
        parallelism: 1
        replicaCompletionCount: 1
      } : null
      manualTriggerConfig: triggerType == 'Manual' ? {
        parallelism: 1
        replicaCompletionCount: 1
      } : null
      registries: [
        {
          server: acr.properties.loginServer
          identity: managedIdentityId
        }
      ]
      secrets: !empty(keyVaultUri) ? [
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
          name: 'weather-enqueuer'
          image: containerImage
          resources: {
            cpu: json(cpu)
            memory: memory
          }
          env: [
            {
              name: 'AZURE_CLIENT_ID'
              value: managedIdentityClientId
            }
            {
              name: 'SERVICE_BUS_NAMESPACE'
              value: serviceBusNamespaceFqdn
            }
            {
              name: 'WEATHER_QUEUE_NAME'
              value: weatherQueueName
            }
            {
              name: 'DASHBOARD_TOPIC_NAME'
              value: dashboardTopicName
            }
            {
              name: 'MESSAGE_COUNT'
              value: messageCount
            }
            {
              name: 'JOB_NAME'
              value: jobName
            }
            {
              name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
              secretRef: !empty(keyVaultUri) ? 'appinsights-connection-string' : null
            }
          ]
        }
      ]
    }
  }
}

output jobId string = containerAppJob.id
output jobName string = containerAppJob.name
