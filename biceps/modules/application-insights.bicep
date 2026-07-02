@description('The location for Application Insights')
param location string

@description('The name of Application Insights')
param appInsightsName string

@description('The resource ID of the Log Analytics workspace')
param logAnalyticsWorkspaceId string

resource applicationInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalyticsWorkspaceId
    RetentionInDays: 90
    IngestionMode: 'LogAnalytics'
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
  }
}

output connectionString string = applicationInsights.properties.ConnectionString
output instrumentationKey string = applicationInsights.properties.InstrumentationKey
output appInsightsId string = applicationInsights.id
output appInsightsName string = applicationInsights.name
