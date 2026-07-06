# Easy Auth en Azure Container Apps - Guía Reproducible

Este documento tiene DOS escenarios:
- **[POC-Fred](#poc-fred)**: Usa un tenant External ID (CIAM) - `cognitomigration.ciamlogin.com`
- **[CMZ (Camuzzi Dev)](#cmz-camuzzi-dev)**: Usa un tenant Workforce estándar (corporativo)

---

## Arquitectura (ambos escenarios)

```
Browser (Usuario)
  ↓ GET /
  → Frontend Container App (Easy Auth ON) → Redirect a login
  ↓ Autenticado (cookie AppServiceAuthSession)
  → Frontend SPA (React) lee /_authinfo para mostrar usuario
  ↓ 
  → Backend Container App (Easy Auth ON) → Valida tokens
```

**¿Por qué Backend necesita Easy Auth?** Porque el Frontend es SPA: el JavaScript corre en el BROWSER y hace requests directos al Backend desde internet.

---

# POC-Fred

## Escenario: External ID (CIAM Tenant)

| Concepto | Valor |
|----------|-------|
| Tenant de Recursos Azure | `b9ccb062-1ade-421f-a3da-0a738577137d` (solo deploy) |
| Tenant de Auth (External ID) | `0a3af0e3-416b-4a6b-97e9-cb3a9a094449` |
| Nombre del tenant CIAM | `cognitomigration` |
| Usuario de prueba | `fartest@cognitomigration.onmicrosoft.com` |

### ⚠️ LECCIÓN CLAVE APRENDIDA

Los tenants **External ID (CIAM)** NO funcionan con el provider estándar "Microsoft" de Easy Auth porque ese provider hardcodea `login.microsoftonline.com`. Los tenants CIAM requieren `{tenant}.ciamlogin.com`.

**Solución**: Usar un **Custom OpenID Connect provider** que respeta el OIDC discovery de ciamlogin.com.

---

### Paso 0: Obtener URLs del ambiente

```bash
# Obtener las URLs de los Container Apps
export FRONTEND_URL=$(az containerapp show --name ca-weather-fe-dev --resource-group rg-far-container-app-easyauth --query "properties.configuration.ingress.fqdn" -o tsv)
export BACKEND_URL=$(az containerapp show --name ca-weather-be-dev --resource-group rg-far-container-app-easyauth --query "properties.configuration.ingress.fqdn" -o tsv)
echo "Frontend: https://$FRONTEND_URL"
echo "Backend:  https://$BACKEND_URL"

# Variables del tenant CIAM
export AUTH_TENANT_ID="0a3af0e3-416b-4a6b-97e9-cb3a9a094449"
export AUTH_TENANT_NAME="cognitomigration"
export OIDC_DISCOVERY="https://${AUTH_TENANT_NAME}.ciamlogin.com/${AUTH_TENANT_ID}/v2.0/.well-known/openid-configuration"
```

---

### Paso 1: Crear App Registration (Frontend) en el tenant CIAM

1. Ir a **Microsoft Entra admin center** → cambiarse al tenant **Cognito Migration**
2. **App registrations** → **New registration**
   - Name: `ContainerApp-Weather-Frontend`
   - Supported account types: **Accounts in this organizational directory only (Cognito Migration only - Single tenant)**
   - Redirect URI:
     - Tipo: **Web** (NO SPA - Easy Auth maneja OAuth server-side)
     - URL: `https://$FRONTEND_URL/.auth/login/entraid/callback`
       > ⚠️ El path es `/entraid/callback` porque usamos un Custom OIDC provider llamado "entraid"
3. Click **Register**
4. Anotar el **Application (client) ID**: `$FRONTEND_CLIENT_ID`

#### 1.1: Crear Client Secret
1. **Certificates & secrets** → **New client secret**
   - Description: `easy-auth-secret`
   - Expires: 6 months
2. **COPIAR el Value** (no el Secret ID): `$CLIENT_SECRET_VALUE`

#### 1.2: Habilitar ID tokens
1. **Authentication** → marcar ✅ **ID tokens (used for implicit and hybrid flows)**
2. **Save**

#### 1.3: Crear User Flow (requerido para CIAM)
1. En el tenant CIAM: **External Identities** → **User flows**
2. **New user flow** → Sign up and sign in
3. Seleccionar: **Email with password**
4. **Create**
5. Ir al user flow → **Applications** → **Add application** → seleccionar la app que creaste

---

### Paso 2: Configurar el Client Secret en Container App

```bash
az containerapp secret set \
  --name ca-weather-fe-dev \
  --resource-group rg-far-container-app-easyauth \
  --secrets microsoft-provider-authentication-secret="$CLIENT_SECRET_VALUE"
```

---

### Paso 3: Configurar Easy Auth (Custom OIDC Provider)

> ⚠️ **NO usar** `az containerapp auth microsoft update` - ese comando hardcodea login.microsoftonline.com
> ✅ **Usar REST API** con un Custom OpenID Connect provider

```bash
SUBSCRIPTION_ID=$(az account show --query id -o tsv)
RESOURCE_GROUP="rg-far-container-app-easyauth"
APP_NAME="ca-weather-fe-dev"

az rest --method PUT \
  --url "https://management.azure.com/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RESOURCE_GROUP}/providers/Microsoft.App/containerApps/${APP_NAME}/authConfigs/current?api-version=2024-03-01" \
  --body "{
    \"properties\": {
      \"platform\": {\"enabled\": true},
      \"globalValidation\": {
        \"unauthenticatedClientAction\": \"RedirectToLoginPage\",
        \"redirectToProvider\": \"entraid\"
      },
      \"identityProviders\": {
        \"customOpenIdConnectProviders\": {
          \"entraid\": {
            \"registration\": {
              \"clientId\": \"${FRONTEND_CLIENT_ID}\",
              \"clientCredential\": {
                \"clientSecretSettingName\": \"microsoft-provider-authentication-secret\"
              },
              \"openIdConnectConfiguration\": {
                \"wellKnownOpenIdConfiguration\": \"${OIDC_DISCOVERY}\"
              }
            },
            \"login\": {
              \"scopes\": [\"openid\", \"profile\", \"email\"]
            }
          }
        }
      },
      \"login\": {
        \"preserveUrlFragmentsForLogins\": false
      }
    }
  }"
```

#### Verificar que funciona:
```bash
# Debe devolver 302 a cognitomigration.ciamlogin.com (NO login.microsoftonline.com)
curl -s -D- -H "Accept: text/html" -H "User-Agent: Mozilla/5.0" "https://$FRONTEND_URL/" | head -5
```

---

### Paso 4: Probar Login

1. Abrir **incógnito**
2. Ir a `https://$FRONTEND_URL`
3. Debe redirigir a `cognitomigration.ciamlogin.com`
4. Loguearse con `fartest@cognitomigration.onmicrosoft.com`
5. Debe volver a la app autenticado

---

### Paso 5: Verificar Info del Usuario

Después de loguearse, visitar:
```
https://$FRONTEND_URL/_authinfo
```

Debe devolver algo como:
```json
{
  "authenticated": true,
  "clientPrincipal": "<base64 encoded claims>",
  "userId": "...",
  "userName": "fartest@cognitomigration.onmicrosoft.com",
  "identityProvider": "entraid"
}
```

---

### Errores Comunes POC-Fred

| Error | Causa | Solución |
|-------|-------|----------|
| `AADSTS500208: domain not valid` | Usar `login.microsoftonline.com` con tenant CIAM | Usar Custom OIDC con `ciamlogin.com` |
| `AADSTS50011: redirect URI mismatch` | Redirect URI en App Reg no coincide | Agregar `https://$FRONTEND_URL/.auth/login/entraid/callback` (tipo Web) |
| 401 en callback (SubStatus 73) | `allowedApplications` restrictivo | NO configurar "Client application requirement" como "only from this application" |
| `/.auth/me` devuelve HTML | Token Store no habilitado (requiere Blob Storage) | Usar `/_authinfo` endpoint de nginx |

---
---

# CMZ (Camuzzi Dev)

## Escenario: Workforce Tenant (Corporativo)

| Concepto | Valor |
|----------|-------|
| Tenant de Recursos Azure | (el mismo que el de Auth - mismo tenant corporativo) |
| Tenant de Auth (Workforce) | `<CAMUZZI_TENANT_ID>` |
| OIDC Discovery | `https://login.microsoftonline.com/<CAMUZZI_TENANT_ID>/v2.0/.well-known/openid-configuration` |

### Diferencia clave vs POC-Fred

En un tenant Workforce (corporativo normal), **SÍ funciona** el provider estándar "Microsoft" de Easy Auth. No necesitás Custom OIDC.

---

### Paso 0: Variables

```bash
export FRONTEND_URL=$(az containerapp show --name ca-weather-fe-dev --resource-group <RG> --query "properties.configuration.ingress.fqdn" -o tsv)
export BACKEND_URL=$(az containerapp show --name ca-weather-be-dev --resource-group <RG> --query "properties.configuration.ingress.fqdn" -o tsv)
export CAMUZZI_TENANT_ID="<tenant-id-camuzzi>"
export FRONTEND_CLIENT_ID="<client-id-frontend>"
```

---

### Paso 1: Crear App Registration (Frontend)

1. **Microsoft Entra admin center** (tenant Camuzzi)
2. **App registrations** → **New registration**
   - Name: `ContainerApp-Camuzzi-Frontend`
   - Supported account types: **Accounts in this organizational directory only**
   - Redirect URI:
     - Tipo: **Web**
     - URL: `https://$FRONTEND_URL/.auth/login/aad/callback`
       > Con el provider estándar "Microsoft", el path es `/aad/callback`
3. **Register**

#### 1.1: Client Secret
- Crear secret → copiar el Value

#### 1.2: Habilitar ID tokens
- Authentication → ✅ ID tokens

---

### Paso 2: Secret en Container App

```bash
az containerapp secret set \
  --name ca-weather-fe-dev \
  --resource-group <RG> \
  --secrets microsoft-provider-authentication-secret="$CLIENT_SECRET_VALUE"
```

---

### Paso 3: Configurar Easy Auth (Provider Microsoft estándar)

```bash
# Con un tenant Workforce SÍ funciona el provider Microsoft estándar
az containerapp auth microsoft update \
  --name ca-weather-fe-dev \
  --resource-group <RG> \
  --client-id "$FRONTEND_CLIENT_ID" \
  --client-secret-name microsoft-provider-authentication-secret \
  --issuer "https://login.microsoftonline.com/${CAMUZZI_TENANT_ID}/v2.0" \
  --allowed-audiences "$FRONTEND_CLIENT_ID" \
  --yes

# Habilitar auth con redirect
az containerapp auth update \
  --name ca-weather-fe-dev \
  --resource-group <RG> \
  --unauthenticated-client-action RedirectToLoginPage \
  --redirect-provider azureactivedirectory \
  --enabled true
```

---

### Paso 4: Probar

1. Incógnito → `https://$FRONTEND_URL`
2. Redirige a `login.microsoftonline.com` (tenant Camuzzi)
3. Login con usuario corporativo
4. Vuelve a la app autenticado

---

### Paso 5: Redirect URI

El path para el provider Microsoft estándar es:
```
https://$FRONTEND_URL/.auth/login/aad/callback
```

---

## Configuración del Frontend (ambos escenarios)

El frontend usa un endpoint `/_authinfo` en nginx que expone los headers de Easy Auth:

**nginx.conf** (ya configurado en el repo):
```nginx
location = /_authinfo {
    default_type application/json;
    set $principal $http_x_ms_client_principal;
    set $principal_id $http_x_ms_client_principal_id;
    set $principal_name $http_x_ms_client_principal_name;
    set $principal_idp $http_x_ms_client_principal_idp;
    
    if ($principal = '') {
        return 200 '{"authenticated":false}';
    }
    return 200 '{"authenticated":true,"clientPrincipal":"$principal","userId":"$principal_id","userName":"$principal_name","identityProvider":"$principal_idp"}';
}
```

El `X-MS-CLIENT-PRINCIPAL` es un JSON base64 con los claims del usuario (nombre, email, roles).

---

## Diferencias Resumen

| Aspecto | POC-Fred (CIAM) | CMZ (Workforce) |
|---------|-----------------|-----------------|
| Tipo de tenant | External ID | Workforce |
| Login URL | `cognitomigration.ciamlogin.com` | `login.microsoftonline.com` |
| Método de config | REST API (Custom OIDC) | `az containerapp auth microsoft update` |
| Provider name | `entraid` (custom) | `azureactivedirectory` (built-in) |
| Callback path | `/.auth/login/entraid/callback` | `/.auth/login/aad/callback` |
| User Flow requerido | SÍ (en External Identities) | NO |
| Frontend user info | `/_authinfo` (nginx) | `/_authinfo` (nginx) |

---

## Notas Técnicas

1. **Token Store** en Container Apps requiere Blob Storage (SAS URL). Por eso `/.auth/me` no funciona out-of-the-box → usamos `/_authinfo` via nginx.
2. **`allowedApplications`** en `defaultAuthorizationPolicy` causa 401 en cross-tenant. NO configurarlo.
3. **Platform type "Web"** (NO "SPA") para la Redirect URI - Easy Auth maneja OAuth server-side aunque el frontend sea React SPA.
4. **CORS**: El backend necesita `AllowCredentials()` si el frontend va a enviar cookies cross-origin.
