@description('The location for the Container App Environment')
param location string

@description('The name of the Container App Environment')
param environmentName string

@description('The resource ID of the Log Analytics workspace')
param logAnalyticsWorkspaceId string

@secure()
@description('Application Insights connection string for managed OpenTelemetry agent')
param appInsightsConnectionString string = ''

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' existing = {
  name: split(logAnalyticsWorkspaceId, '/')[8]
}

// Using 2024-10-02-preview for OpenTelemetry agent support
// Ref: https://learn.microsoft.com/azure/container-apps/opentelemetry-agents
resource environment 'Microsoft.App/managedEnvironments@2024-10-02-preview' = {
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
    // Managed OpenTelemetry Agent: routes traces and logs to App Insights at platform level
    // This complements the in-app SDK which sends data directly
    appInsightsConfiguration: !empty(appInsightsConnectionString) ? {
      connectionString: appInsightsConnectionString
    } : null
    openTelemetryConfiguration: !empty(appInsightsConnectionString) ? {
      tracesConfiguration: {
        destinations: ['appInsights']
      }
      logsConfiguration: {
        destinations: ['appInsights']
      }
    } : null
    workloadProfiles: [
      {
        name: 'Consumption'
        workloadProfileType: 'Consumption'
      }
    ]
  }
}

output environmentId string = environment.id
output environmentName string = environment.name
