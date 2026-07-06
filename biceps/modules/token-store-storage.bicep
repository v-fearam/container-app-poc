targetScope = 'resourceGroup'

@description('Location')
param location string

@description('Storage account name')
param storageAccountName string

@description('Blob container name for token store')
param containerName string = 'tokenstore'

@description('Current UTC time (used for SAS expiry calculation)')
param currentTime string = utcNow()

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  kind: 'StorageV2'
  sku: {
    name: 'Standard_LRS'
  }
  properties: {
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    supportsHttpsTrafficOnly: true
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storageAccount
  name: 'default'
}

resource tokenStoreContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: containerName
  properties: {
    publicAccess: 'None'
  }
}

// Generate a SAS token valid for 2 years with container-level permissions
var accountSasProperties = {
  signedServices: 'b'
  signedResourceTypes: 'co'
  signedPermission: 'rwdl'
  signedExpiry: dateTimeAdd(currentTime, 'P2Y')
  signedProtocol: 'https'
}

var sasToken = storageAccount.listAccountSas('2023-05-01', accountSasProperties).accountSasToken
var tokenStoreSasUrl = '${storageAccount.properties.primaryEndpoints.blob}${containerName}?${sasToken}'

output storageAccountName string = storageAccount.name
output tokenStoreSasUrl string = tokenStoreSasUrl
