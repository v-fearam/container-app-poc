// ============================================================================
// Key Vault Module — Centralized secrets for Container Apps
// ============================================================================
// Creates a Key Vault and grants "Key Vault Secrets User" role to managed
// identities so Container Apps can reference secrets via keyVaultUrl.
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

output keyVaultName string = keyVault.name
output keyVaultUri string = keyVault.properties.vaultUri
output keyVaultId string = keyVault.id
