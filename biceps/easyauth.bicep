// ============================================================================
// Easy Auth Configuration — Standalone Deployment
// ============================================================================
// Deploy AFTER main.bicep has created the Container Apps and Key Vault.
// This configures Easy Auth (Custom OIDC) on both frontend and backend.
//
// PREREQUISITES:
//   Secrets must exist in Key Vault (set once, persist across all deploys):
//     - auth-client-secret-frontend
//     - auth-client-secret-backend
//     - token-store-sas
//
//   az deployment group create --resource-group <RG> \
//     --template-file biceps/easyauth.bicep \
//     --parameters \
//       frontendClientId=<FRONTEND_CLIENT_ID> \
//       backendClientId=<BACKEND_CLIENT_ID> \
//       oidcWellKnownUrl=<OIDC_DISCOVERY_URL>
//
// ============================================================================

targetScope = 'resourceGroup'

@description('Location for resources')
param location string = resourceGroup().location

// --- Container App names (must already exist from main.bicep) ---
@description('Frontend Container App name')
param frontendAppName string = 'ca-weather-fe-dev'

@description('Backend Container App name')
param backendAppName string = 'ca-weather-be-dev'

// --- App Registration IDs ---
@description('Frontend App Registration Client ID')
param frontendClientId string

@description('Backend App Registration Client ID')
param backendClientId string

// --- OIDC Configuration ---
@description('OIDC Well-Known Configuration URL (CIAM: https://{tenant}.ciamlogin.com/{tenantId}/v2.0/.well-known/openid-configuration)')
param oidcWellKnownUrl string

@description('Custom OIDC provider name (used in callback path: /.auth/login/{name}/callback)')
param providerName string = 'entraid'

// --- Token Store ---
@description('Storage account name for Token Store')
param tokenStoreStorageAccountName string = 'st${take(replace(toLower('weather'), '-', ''), 8)}tokens${take(uniqueString(resourceGroup().id), 4)}'

// ============================================================================
// Token Store Storage Account
// ============================================================================
module tokenStoreStorage 'modules/token-store-storage.bicep' = {
  name: 'easyauth-token-store'
  params: {
    location: location
    storageAccountName: tokenStoreStorageAccountName
  }
}

// ============================================================================
// Reference existing Container Apps
// ============================================================================
resource frontendApp 'Microsoft.App/containerApps@2024-03-01' existing = {
  name: frontendAppName
}

resource backendApp 'Microsoft.App/containerApps@2024-03-01' existing = {
  name: backendAppName
}

// ============================================================================
// Frontend Auth Configuration
// ============================================================================
resource frontendAuthConfig 'Microsoft.App/containerApps/authConfigs@2024-03-01' = {
  parent: frontendApp
  name: 'current'
  properties: {
    platform: {
      enabled: true
    }
    globalValidation: {
      unauthenticatedClientAction: 'RedirectToLoginPage'
      redirectToProvider: providerName
    }
    identityProviders: {
      customOpenIdConnectProviders: {
        '${providerName}': {
          registration: {
            clientId: frontendClientId
            clientCredential: {
              clientSecretSettingName: 'microsoft-provider-authentication-secret'
            }
            openIdConnectConfiguration: {
              wellKnownOpenIdConfiguration: oidcWellKnownUrl
            }
          }
          login: {
            scopes: ['openid', 'profile', 'email', 'offline_access', 'api://${backendClientId}/.default']
          }
        }
      }
    }
    login: {
      preserveUrlFragmentsForLogins: false
      tokenStore: {
        enabled: true
        azureBlobStorage: {
          sasUrlSettingName: 'token-store-sas'
        }
      }
    }
  }
}

// ============================================================================
// Backend Auth Configuration
// Uses azureActiveDirectory (NOT customOpenIdConnectProviders) because:
// - azureActiveDirectory validates Bearer tokens in API calls → injects X-MS-CLIENT-PRINCIPAL
// - customOpenIdConnectProviders only handles login redirect flow, NOT token validation
// ============================================================================
resource backendAuthConfig 'Microsoft.App/containerApps/authConfigs@2024-03-01' = {
  parent: backendApp
  name: 'current'
  properties: {
    platform: {
      enabled: true
    }
    globalValidation: {
      unauthenticatedClientAction: 'AllowAnonymous'
    }
    identityProviders: {
      azureActiveDirectory: {
        enabled: true
        isAutoProvisioned: false
        registration: {
          clientId: backendClientId
          clientSecretSettingName: 'microsoft-provider-authentication-secret'
          openIdIssuer: split(oidcWellKnownUrl, '/.well-known')[0]
        }
        validation: {
          allowedAudiences: [backendClientId]
        }
      }
    }
    login: {
      preserveUrlFragmentsForLogins: false
    }
  }
}

// ============================================================================
// Outputs
// ============================================================================
output tokenStoreStorageAccountName string = tokenStoreStorage.outputs.storageAccountName
output tokenStoreSasUrl string = tokenStoreStorage.outputs.tokenStoreSasUrl
output frontendCallbackUrl string = 'https://${frontendApp.properties.configuration.ingress.fqdn}/.auth/login/${providerName}/callback'
