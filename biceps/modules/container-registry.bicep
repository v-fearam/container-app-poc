@description('The location for the Container Registry')
param location string

@description('The name of the Container Registry')
param acrName string

@description('The SKU for the Container Registry')
@allowed([
  'Basic'
  'Standard'
  'Premium'
])
param acrSku string = 'Basic'

resource containerRegistry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: acrName
  location: location
  sku: {
    name: acrSku
  }
  properties: {
    adminUserEnabled: false
    publicNetworkAccess: 'Enabled'
    networkRuleBypassOptions: 'AzureServices'
  }
}

output acrLoginServer string = containerRegistry.properties.loginServer
output acrName string = containerRegistry.name
output acrId string = containerRegistry.id
