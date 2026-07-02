@description('The location for the Container App Environment')
param location string

@description('The name of the Container App Environment')
param environmentName string

@description('The resource ID of the Log Analytics workspace')
param logAnalyticsWorkspaceId string

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2025-07-01' existing = {
  name: split(logAnalyticsWorkspaceId, '/')[8]
}

resource environment 'Microsoft.App/managedEnvironments@2026-01-01' = {
  name: environmentName
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

output environmentId string = environment.id
output environmentName string = environment.name
