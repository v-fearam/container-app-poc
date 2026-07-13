targetScope = 'resourceGroup'

@description('Location for SQL Server resources')
param location string = resourceGroup().location

@description('SQL Server name (must be globally unique)')
param serverName string

@description('SQL Database name')
param databaseName string = 'dashboard-poc'

@description('Entra ID administrator object ID (user or group)')
param entraAdminObjectId string

@description('Entra ID administrator login name (UPN or group name)')
param entraAdminLogin string

@description('Entra ID administrator tenant ID')
param entraAdminTenantId string = subscription().tenantId

@description('SQL admin username (temporary, will use Entra ID)')
param sqlAdminUsername string = 'sqladmin'

@description('SQL admin password (temporary, will use Entra ID)')
@secure()
param sqlAdminPassword string = 'P@ssw0rd-${uniqueString(resourceGroup().id, serverName)}'

@description('Tags for all resources')
param tags object = {}

// SQL Server with both SQL auth (required) and Entra ID auth
resource sqlServer 'Microsoft.Sql/servers@2024-05-01-preview' = {
  name: serverName
  location: location
  tags: tags
  properties: {
    minimalTlsVersion: '1.2'
    publicNetworkAccess: 'Enabled'
    administratorLogin: sqlAdminUsername
    administratorLoginPassword: sqlAdminPassword
  }
}

// Entra ID administrator as a child resource (correct way for API version 2024-05-01-preview)
resource sqlServerAdministrator 'Microsoft.Sql/servers/administrators@2024-05-01-preview' = {
  parent: sqlServer
  name: 'ActiveDirectory'
  properties: {
    administratorType: 'ActiveDirectory'
    login: entraAdminLogin
    sid: entraAdminObjectId
    tenantId: entraAdminTenantId
  }
}

// Firewall rule: Allow Azure services (for Container Apps to connect)
resource allowAzureServices 'Microsoft.Sql/servers/firewallRules@2024-05-01-preview' = {
  parent: sqlServer
  name: 'AllowAllWindowsAzureIps'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

// SQL Database - Basic tier for POC (cheapest option)
resource database 'Microsoft.Sql/servers/databases@2024-05-01-preview' = {
  parent: sqlServer
  name: databaseName
  location: location
  tags: tags
  sku: {
    name: 'Basic'
    tier: 'Basic'
    capacity: 5 // 5 DTUs
  }
  properties: {
    collation: 'SQL_Latin1_General_CP1_CI_AS'
    maxSizeBytes: 2147483648 // 2 GB
    catalogCollation: 'SQL_Latin1_General_CP1_CI_AS'
    zoneRedundant: false
    readScale: 'Disabled'
  }
}

output sqlServerFqdn string = sqlServer.properties.fullyQualifiedDomainName
output sqlServerName string = sqlServer.name
output databaseName string = database.name
output connectionString string = 'Server=tcp:${sqlServer.properties.fullyQualifiedDomainName},1433;Initial Catalog=${database.name};Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;'
