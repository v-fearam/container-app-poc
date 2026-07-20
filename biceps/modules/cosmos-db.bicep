// ============================================================================
// Cosmos DB Module — Serverless NoSQL database for Change Feed POC
// ============================================================================
// Creates a Cosmos DB account (serverless), database, and containers for
// the Change Feed POC: personas (monitored), changefeed-leases, changefeed-errors.
// Grants "Cosmos DB Built-in Data Contributor" role to managed identity.
// ============================================================================

targetScope = 'resourceGroup'

@description('Cosmos DB account name')
param cosmosAccountName string

@description('Location for Cosmos DB')
param location string = resourceGroup().location

@description('Database name')
param databaseName string = 'change-feed-poc'

@description('Principal ID of managed identity that needs Cosmos DB Data Contributor role')
param dataContributorPrincipalId string = ''

@description('Tags to apply to Cosmos DB resources')
param tags object = {}

// Cosmos DB account (serverless)
resource cosmosAccount 'Microsoft.DocumentDB/databaseAccounts@2024-05-15' = {
  name: cosmosAccountName
  location: location
  tags: tags
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: false
      }
    ]
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }
    capabilities: [
      {
        name: 'EnableServerless'
      }
    ]
    enableAutomaticFailover: false
    enableMultipleWriteLocations: false
    disableKeyBasedMetadataWriteAccess: false
    publicNetworkAccess: 'Enabled'
  }
}

// Database
resource database 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-05-15' = {
  parent: cosmosAccount
  name: databaseName
  properties: {
    resource: {
      id: databaseName
    }
  }
}

// Container: personas (monitored container)
resource personasContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: database
  name: 'personas'
  properties: {
    resource: {
      id: 'personas'
      partitionKey: {
        paths: [
          '/id'
        ]
        kind: 'Hash'
      }
      defaultTtl: -1 // Enable per-document TTL (no default expiration)
      indexingPolicy: {
        indexingMode: 'consistent'
        automatic: true
        includedPaths: [
          {
            path: '/*'
          }
        ]
      }
    }
  }
}

// Container: changefeed-leases (checkpoint storage for Change Feed Processor)
resource leasesContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: database
  name: 'changefeed-leases'
  properties: {
    resource: {
      id: 'changefeed-leases'
      partitionKey: {
        paths: [
          '/id'
        ]
        kind: 'Hash'
      }
    }
  }
}

// Container: changefeed-errors (dead-letter for failed items)
resource errorsContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: database
  name: 'changefeed-errors'
  properties: {
    resource: {
      id: 'changefeed-errors'
      partitionKey: {
        paths: [
          '/id'
        ]
        kind: 'Hash'
      }
    }
  }
}

// Role assignment: Cosmos DB Built-in Data Contributor
// Role definition ID: 00000000-0000-0000-0000-000000000002 (built-in)
// Ref: https://learn.microsoft.com/azure/cosmos-db/how-to-setup-rbac#built-in-role-definitions
var dataContributorRoleId = '00000000-0000-0000-0000-000000000002'

resource roleAssignment 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2024-05-15' = if (!empty(dataContributorPrincipalId)) {
  parent: cosmosAccount
  name: guid(cosmosAccount.id, dataContributorPrincipalId, dataContributorRoleId)
  properties: {
    roleDefinitionId: '${cosmosAccount.id}/sqlRoleDefinitions/${dataContributorRoleId}'
    principalId: dataContributorPrincipalId
    scope: cosmosAccount.id
  }
}

// Outputs
@description('Cosmos DB account endpoint')
output endpoint string = cosmosAccount.properties.documentEndpoint

@description('Cosmos DB account name')
output accountName string = cosmosAccount.name

@description('Database name')
output databaseName string = database.name

@description('Cosmos DB account resource ID')
output accountId string = cosmosAccount.id
