// ============================================================================
// Key Vault Module — Centralized secrets for Container Apps
// ============================================================================
// Creates a Key Vault, seeds secrets with known values (e.g., connection strings),
// and grants "Key Vault Secrets User" role to managed identities.
// Auth secrets (client secrets, SAS tokens) must be set manually once.
// ============================================================================

targetScope = 'resourceGroup'

@description('Key Vault name')
param keyVaultName string

@description('Location for Key Vault')
param location string = resourceGroup().location

@description('Principal IDs of managed identities that need Key Vault Secrets User role')
param secretUserPrincipalIds array = []

@description('Tenant ID (defaults to current subscription tenant)')
param tenantId string = subscription().tenantId

@description('Enable soft delete (recommended for production)')
param enableSoftDelete bool = true

@description('Soft delete retention in days')
param softDeleteRetentionInDays int = 7

@description('Tags to apply to Key Vault')
param tags object = {}

// --- Secrets to seed automatically (values known at deploy time) ---

@description('Application Insights connection string (seeded automatically)')
@secure()
param appInsightsConnectionString string = ''

@description('SQL connection string (seeded automatically)')
@secure()
param sqlConnectionString string = ''

// Key Vault resource
resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  tags: tags
  properties: {
    sku: {
      family: 'A'
      name: 'standard'
    }
    tenantId: tenantId
    enableRbacAuthorization: true
    enableSoftDelete: enableSoftDelete
    softDeleteRetentionInDays: softDeleteRetentionInDays
    enabledForDeployment: false
    enabledForDiskEncryption: false
    enabledForTemplateDeployment: false
  }
}

// Grant "Key Vault Secrets User" role to each managed identity
// Role ID: 4633458b-17de-408a-b874-0445c86b69e6
@batchSize(1)
resource kvSecretsUserRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = [
  for (principalId, i) in secretUserPrincipalIds: {
    name: guid(keyVault.id, principalId, '4633458b-17de-408a-b874-0445c86b69e6')
    scope: keyVault
    properties: {
      roleDefinitionId: subscriptionResourceId(
        'Microsoft.Authorization/roleDefinitions',
        '4633458b-17de-408a-b874-0445c86b69e6'
      )
      principalId: principalId
      principalType: 'ServicePrincipal'
    }
  }
]

// Grant deployer "Key Vault Secrets Officer" so Bicep can create secrets
// The deployer principal is obtained from the deployment context
// This is handled by RBAC — deployer must have Secrets Officer before running this

// --- Auto-seeded secrets (created/updated on every deploy) ---

resource secretAppInsights 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(appInsightsConnectionString)) {
  parent: keyVault
  name: 'appinsights-connection-string'
  properties: {
    value: appInsightsConnectionString
  }
}

resource secretSqlConnection 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(sqlConnectionString)) {
  parent: keyVault
  name: 'sql-connection-string'
  properties: {
    value: sqlConnectionString
  }
}

output keyVaultName string = keyVault.name
output keyVaultUri string = keyVault.properties.vaultUri
output keyVaultId string = keyVault.id
