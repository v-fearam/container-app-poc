targetScope = 'resourceGroup'

@description('Location for Service Bus resources')
param location string = resourceGroup().location

@description('Service Bus namespace name')
param namespaceName string

@description('Queue name for worker jobs')
param queueName string = 'weather-jobs'

@description('Max delivery attempts before DLQ')
param maxDeliveryCount int = 3

@description('Lock duration (ISO 8601). Must exceed max processing time.')
param lockDuration string = 'PT5M'

@description('Message time to live (ISO 8601)')
param defaultMessageTimeToLive string = 'P1D'

// Service Bus Namespace (Standard supports sessions, DLQ, topics)
resource serviceBusNamespace 'Microsoft.ServiceBus/namespaces@2024-01-01' = {
  name: namespaceName
  location: location
  sku: {
    name: 'Standard'
    tier: 'Standard'
  }
  properties: {
    minimumTlsVersion: '1.2'
  }
}

// Queue with DLQ enabled
resource queue 'Microsoft.ServiceBus/namespaces/queues@2024-01-01' = {
  parent: serviceBusNamespace
  name: queueName
  properties: {
    lockDuration: lockDuration
    maxDeliveryCount: maxDeliveryCount
    defaultMessageTimeToLive: defaultMessageTimeToLive
    deadLetteringOnMessageExpiration: true
    enablePartitioning: false
    requiresSession: false
  }
}

output namespaceName string = serviceBusNamespace.name
output namespaceId string = serviceBusNamespace.id
output namespaceFqdn string = '${serviceBusNamespace.name}.servicebus.windows.net'
output queueName string = queue.name
