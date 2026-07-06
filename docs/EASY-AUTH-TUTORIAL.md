# Easy Auth en Azure Container Apps - Guía Completa

Este documento cubre la configuración de Easy Auth (Authentication) en Azure Container Apps usando un **Custom OIDC provider**. Funciona tanto con tenants CIAM (External ID) como Workforce (corporativo).

## Arquitectura

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           FLUJO DE AUTENTICACIÓN                             │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Browser                                                                     │
│    │                                                                         │
│    ├─── GET / ──────► Frontend Container App (ca-weather-fe-dev)             │
│    │                    │                                                    │
│    │                    ├── Easy Auth intercepta (no hay cookie)              │
│    │                    │     → 302 Redirect a OIDC Login                    │
│    │                    │                                                    │
│    ◄── Redirect ◄───────┘                                                    │
│    │                                                                         │
│    ├─── Login ─────► OIDC Provider (ciamlogin.com ó login.microsoftonline)   │
│    │                    │                                                    │
│    │                    ├── Usuario se autentica                              │
│    │                    │     → auth code enviado a callback                  │
│    │                    │                                                    │
│    ◄── Callback ◄───────┘                                                    │
│    │                                                                         │
│    │  Easy Auth intercambia code por tokens:                                 │
│    │    • id_token (identidad del usuario)                                   │
│    │    • access_token (para el backend API scope)                            │
│    │  → Tokens guardados en Blob Storage (Token Store)                       │
│    │  → Cookie "AppServiceAuthSession" seteada                               │
│    │                                                                         │
│    ├─── GET /_authinfo ──► nginx expone headers como JSON:                   │
│    │                         • clientPrincipal (base64 claims)                │
│    │                         • accessToken (para backend)                     │
│    │                                                                         │
│    ├─── GET /weatherforecast ──► Backend (ca-weather-be-dev)                 │
│    │    Authorization: Bearer {accessToken}                                   │
│    │                    │                                                    │
│    │                    ├── Easy Auth (AllowAnonymous) valida Bearer token    │
│    │                    │     → Inyecta X-MS-CLIENT-PRINCIPAL                │
│    │                    │                                                    │
│    │                    ├── Código .NET lee X-MS-CLIENT-PRINCIPAL             │
│    │                    │     → Si null → 401 Unauthorized                   │
│    │                    │     → Si válido → retorna datos                    │
│    │                    │                                                    │
│    ◄── JSON response ◄──┘                                                    │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Dos Escenarios

| Aspecto | POC-Fred (CIAM) | CMZ - Camuzzi Dev (Workforce) |
|---------|-----------------|-------------------------------|
| Tipo de tenant | External ID (CIAM) | Workforce (corporativo) |
| Login URL | `cognitomigration.ciamlogin.com` | `login.microsoftonline.com` |
| OIDC Discovery URL | `https://cognitomigration.ciamlogin.com/{tenantId}/v2.0/.well-known/openid-configuration` | `https://login.microsoftonline.com/{tenantId}/v2.0/.well-known/openid-configuration` |
| Callback path | `/.auth/login/entraid/callback` | `/.auth/login/entraid/callback` |
| Provider name | `entraid` (Custom OIDC) | `entraid` (Custom OIDC) |
| Método de configuración | REST API (Custom OIDC) | REST API (Custom OIDC) — **MISMO enfoque** |
| User Flow requerido | SÍ (External Identities) | NO |

> **⚠️ LECCIÓN CLAVE**: Los tenants CIAM **NO pueden usar** el provider built-in "Microsoft" de Easy Auth (hardcodea `login.microsoftonline.com`). La solución es usar **Custom OIDC via REST API**, y esto funciona para AMBOS tipos de tenant. Por lo tanto, usamos el mismo enfoque (Custom OIDC con provider name `entraid`) en ambos escenarios.

---

## Despliegue con Bicep (Método Recomendado)

El directorio `biceps/` contiene templates que despliegan la infraestructura completa incluyendo Easy Auth, Token Store, y toda la configuración.

### Despliegue con parámetros inline

```bash
az deployment group create \
  --resource-group rg-far-container-app-easyauth \
  --template-file biceps/main.bicep \
  --parameters \
    enableEasyAuth=true \
    easyAuthFrontendClientId="e9e60b6c-3b17-40f9-8722-0e2387fb232d" \
    easyAuthFrontendClientSecret="<TU-CLIENT-SECRET-FRONTEND>" \
    easyAuthBackendClientId="9cbeba2f-de5d-42c5-b886-1f1395e59e3e" \
    easyAuthBackendClientSecret="<TU-CLIENT-SECRET-BACKEND>" \
    oidcWellKnownUrl="https://cognitomigration.ciamlogin.com/0a3af0e3-416b-4a6b-97e9-cb3a9a094449/v2.0/.well-known/openid-configuration" \
    easyAuthProviderName="entraid"
```

### Despliegue con archivo de parámetros

Crear un archivo `parameters.json`:

```json
{
  "$schema": "https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#",
  "contentVersion": "1.0.0.0",
  "parameters": {
    "enableEasyAuth": { "value": true },
    "easyAuthFrontendClientId": { "value": "e9e60b6c-3b17-40f9-8722-0e2387fb232d" },
    "easyAuthFrontendClientSecret": { "value": "<TU-CLIENT-SECRET-FRONTEND>" },
    "easyAuthBackendClientId": { "value": "9cbeba2f-de5d-42c5-b886-1f1395e59e3e" },
    "easyAuthBackendClientSecret": { "value": "<TU-CLIENT-SECRET-BACKEND>" },
    "oidcWellKnownUrl": { "value": "https://cognitomigration.ciamlogin.com/0a3af0e3-416b-4a6b-97e9-cb3a9a094449/v2.0/.well-known/openid-configuration" },
    "easyAuthProviderName": { "value": "entraid" }
  }
}
```

```bash
az deployment group create \
  --resource-group rg-far-container-app-easyauth \
  --template-file biceps/main.bicep \
  --parameters @parameters.json
```

### Qué despliega el Bicep

El template `main.bicep` orquesta módulos en `biceps/modules/`:
- **token-store-storage.bicep**: Storage Account + blob container `tokenstore` + genera SAS URL (2 años)
- **frontend-container-app.bicep**: Container App con Easy Auth (`RedirectToLoginPage`), Token Store, y scope del backend API
- **backend-container-app.bicep**: Container App con Easy Auth (`AllowAnonymous`), sin Token Store
- Además: Container Registry, Log Analytics, Application Insights, Container App Environment

---

## Pre-requisitos: App Registrations

### Frontend App Registration

1. **Crear la App Registration** en el tenant de autenticación (CIAM o Workforce):
   - Ir a **Microsoft Entra admin center** → **App registrations** → **New registration**
   - Name: `ContainerApp-Weather-Frontend`
   - Supported account types: **Accounts in this organizational directory only**

2. **Redirect URI**:
   - Tipo: **Web** (NO "SPA" — Easy Auth maneja OAuth server-side)
   - URL: `https://{frontend-fqdn}/.auth/login/entraid/callback`
   > ⚠️ El path usa `/entraid/` porque el Custom OIDC provider se llama `entraid`

3. **Crear Client Secret**:
   - **Certificates & secrets** → **New client secret**
   - Description: `easy-auth-secret`
   - Expires: 6 months (o lo que aplique)
   - **COPIAR el Value** inmediatamente (no se puede ver después)

4. **Habilitar ID tokens**:
   - **Authentication** → marcar ✅ **ID tokens (used for implicit and hybrid flows)**
   - **Save**

5. **Para CIAM únicamente — Crear User Flow**:
   - En el tenant CIAM: **External Identities** → **User flows**
   - **New user flow** → Sign up and sign in
   - Seleccionar: **Email with password**
   - **Create**
   - Ir al user flow → **Applications** → **Add application** → seleccionar la app frontend

6. **Agregar permiso para backend API scope**:
   - **API permissions** → **Add a permission** → **My APIs** → seleccionar la App Registration del backend
   - Agregar el scope: `api://{backend-client-id}/.default`
   - (Opcionalmente) Grant admin consent

### Backend App Registration

1. **Crear la App Registration** en el mismo tenant de autenticación:
   - Name: `ContainerApp-Weather-Backend`
   - Supported account types: **Accounts in this organizational directory only**
   - Redirect URI: No se requiere

2. **Expose an API**:
   - **Expose an API** → Set **Application ID URI** a `api://{client-id}` (click "Set" para usar el default)
   - El scope por defecto `api://{client-id}/.default` queda disponible automáticamente

3. **Crear Client Secret**:
   - **Certificates & secrets** → **New client secret**
   - Copiar el Value

---

## Configuración Manual (si no usás Bicep)

### Paso 1: Storage Account para Token Store

El Token Store en Container Apps requiere Blob Storage (a diferencia de App Service que lo tiene built-in).

```bash
RESOURCE_GROUP="rg-far-container-app-easyauth"
STORAGE_ACCOUNT="stweathertokens"
CONTAINER_NAME="tokenstore"

# Crear Storage Account
az storage account create \
  --name $STORAGE_ACCOUNT \
  --resource-group $RESOURCE_GROUP \
  --location eastus2 \
  --sku Standard_LRS \
  --min-tls-version TLS1_2 \
  --allow-blob-public-access false

# Crear el container para tokens
az storage container create \
  --name $CONTAINER_NAME \
  --account-name $STORAGE_ACCOUNT

# Generar SAS URL con permisos de lectura/escritura (2 años)
EXPIRY=$(date -u -d "+2 years" '+%Y-%m-%dT%H:%MZ')
SAS_TOKEN=$(az storage account generate-sas \
  --account-name $STORAGE_ACCOUNT \
  --services b \
  --resource-types co \
  --permissions rwdl \
  --expiry $EXPIRY \
  --https-only \
  -o tsv)

BLOB_ENDPOINT=$(az storage account show \
  --name $STORAGE_ACCOUNT \
  --query "primaryEndpoints.blob" -o tsv)

TOKEN_STORE_SAS_URL="${BLOB_ENDPOINT}${CONTAINER_NAME}?${SAS_TOKEN}"
echo "Token Store SAS URL: $TOKEN_STORE_SAS_URL"
```

### Paso 2: Secrets en Container Apps

```bash
RESOURCE_GROUP="rg-far-container-app-easyauth"

# Frontend necesita 2 secrets:
# 1. Client secret de la App Registration del frontend
# 2. SAS URL del Token Store
az containerapp secret set \
  --name ca-weather-fe-dev \
  --resource-group $RESOURCE_GROUP \
  --secrets \
    microsoft-provider-authentication-secret="$FRONTEND_CLIENT_SECRET" \
    token-store-sas="$TOKEN_STORE_SAS_URL"

# Backend necesita 1 secret:
# 1. Client secret de la App Registration del backend
az containerapp secret set \
  --name ca-weather-be-dev \
  --resource-group $RESOURCE_GROUP \
  --secrets \
    microsoft-provider-authentication-secret="$BACKEND_CLIENT_SECRET"
```

### Paso 3: Easy Auth Frontend (REST API)

> ⚠️ **NO usar** `az containerapp auth microsoft update` — hardcodea `login.microsoftonline.com`
> ✅ **Usar REST API** con Custom OpenID Connect provider

```bash
SUBSCRIPTION_ID=$(az account show --query id -o tsv)
RESOURCE_GROUP="rg-far-container-app-easyauth"
APP_NAME="ca-weather-fe-dev"
FRONTEND_CLIENT_ID="e9e60b6c-3b17-40f9-8722-0e2387fb232d"
BACKEND_CLIENT_ID="9cbeba2f-de5d-42c5-b886-1f1395e59e3e"
OIDC_DISCOVERY="https://cognitomigration.ciamlogin.com/0a3af0e3-416b-4a6b-97e9-cb3a9a094449/v2.0/.well-known/openid-configuration"

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
              \"scopes\": [\"openid\", \"profile\", \"email\", \"api://${BACKEND_CLIENT_ID}/.default\"]
            }
          }
        }
      },
      \"login\": {
        \"preserveUrlFragmentsForLogins\": false,
        \"tokenStore\": {
          \"enabled\": true,
          \"azureBlobStorage\": {
            \"sasUrlSettingName\": \"token-store-sas\"
          }
        }
      }
    }
  }"
```

**Puntos clave del JSON:**
- `unauthenticatedClientAction: RedirectToLoginPage` — redirige usuarios no autenticados al login
- `redirectToProvider: entraid` — indica cuál provider usar para el redirect
- `scopes` incluye `api://{backend-client-id}/.default` — esto le pide a Entra ID un access token válido para el backend
- `tokenStore.enabled: true` con `azureBlobStorage` — habilita almacenamiento de tokens para que `/.auth/me` y los headers `X-MS-TOKEN-*` funcionen

### Paso 4: Easy Auth Backend (REST API)

```bash
SUBSCRIPTION_ID=$(az account show --query id -o tsv)
RESOURCE_GROUP="rg-far-container-app-easyauth"
APP_NAME="ca-weather-be-dev"
BACKEND_CLIENT_ID="9cbeba2f-de5d-42c5-b886-1f1395e59e3e"
OIDC_DISCOVERY="https://cognitomigration.ciamlogin.com/0a3af0e3-416b-4a6b-97e9-cb3a9a094449/v2.0/.well-known/openid-configuration"

az rest --method PUT \
  --url "https://management.azure.com/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RESOURCE_GROUP}/providers/Microsoft.App/containerApps/${APP_NAME}/authConfigs/current?api-version=2024-03-01" \
  --body "{
    \"properties\": {
      \"platform\": {\"enabled\": true},
      \"globalValidation\": {
        \"unauthenticatedClientAction\": \"AllowAnonymous\"
      },
      \"identityProviders\": {
        \"customOpenIdConnectProviders\": {
          \"entraid\": {
            \"registration\": {
              \"clientId\": \"${BACKEND_CLIENT_ID}\",
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

**Puntos clave del JSON:**
- `unauthenticatedClientAction: AllowAnonymous` — NO redirige, deja pasar requests sin token (necesario para que CORS OPTIONS funcione)
- No tiene Token Store — el backend no necesita almacenar tokens, solo validarlos
- Cuando llega un Bearer token válido, Easy Auth inyecta `X-MS-CLIENT-PRINCIPAL` automáticamente
- El código del backend decide si retorna 401 cuando no hay principal (ver Program.cs)

### Paso 5: Verificar

1. **Abrir el frontend en ventana de incógnito**:
   ```
   https://ca-weather-fe-dev.{hash}.eastus2.azurecontainerapps.io
   ```

2. **Debe redirigir al login** (según el escenario):
   - POC-Fred: `cognitomigration.ciamlogin.com`
   - CMZ: `login.microsoftonline.com`

3. **Autenticarse** con el usuario de prueba

4. **La app muestra info del usuario**: nombre, email, roles en el navbar

5. **Click "Obtener Clima"**: debe retornar datos del pronóstico (confirma que el backend aceptó el token)

6. **Verificar que el backend rechaza requests sin token**:
   ```bash
   # Sin Bearer token → debe devolver 401
   curl -s -o /dev/null -w "%{http_code}" \
     "https://ca-weather-be-dev.{hash}.eastus2.azurecontainerapps.io/weatherforecast"
   # Esperado: 401
   ```

7. **Verificar /.auth/me (requiere Token Store)**:
   ```bash
   # Con la cookie de sesión → debe devolver JSON con tokens
   curl -s --cookie "AppServiceAuthSession=<tu-cookie>" \
     "https://ca-weather-fe-dev.{hash}.eastus2.azurecontainerapps.io/.auth/me"
   ```

---

## Cómo Funciona (Detalles Técnicos)

### Token Store — Qué es y por qué existe

El **Token Store** es un componente que permite a Easy Auth **persistir los tokens OAuth** (id_token, access_token, refresh_token) en Azure Blob Storage.

**¿Por qué es necesario?**

| | Sin Token Store | Con Token Store |
|---|---|---|
| `X-MS-CLIENT-PRINCIPAL` | ✅ Disponible | ✅ Disponible |
| `X-MS-TOKEN-ENTRAID-ACCESS-TOKEN` | ❌ No disponible | ✅ Disponible |
| `X-MS-TOKEN-ENTRAID-ID-TOKEN` | ❌ No disponible | ✅ Disponible |
| `/.auth/me` | ❌ Devuelve HTML | ✅ Devuelve JSON con tokens |
| La SPA puede enviar Bearer al backend | ❌ No (no tiene el token) | ✅ Sí |

**¿Quién lo necesita?** Solo el **frontend** Container App. El backend no necesita Token Store porque no almacena tokens — solo los valida cuando llegan como Bearer header.

**¿Por qué Blob Storage?** En App Service, el Token Store usa el filesystem local del servidor. Pero Container Apps **no tienen filesystem persistente** (los containers son efímeros), así que Azure requiere un almacenamiento externo: un Blob Storage con acceso via SAS URL.

**¿Qué se guarda en el blob?** Un archivo JSON por sesión de usuario con:
- `id_token` — identidad del usuario (claims, nombre, email, roles)
- `access_token` — token para llamar al backend API (tiene el scope `api://{backend-client-id}/.default`)
- `refresh_token` — para renovar tokens sin que el usuario vuelva a loguearse
- Metadatos de expiración

**Diagrama:**
```
Usuario logueado → Easy Auth tiene tokens
                        │
                        ├── Guarda en Blob Storage (tokenstore container)
                        │     archivo: /tokenstore/{session-id}.json
                        │
                        └── En cada request del usuario:
                              1. Lee cookie AppServiceAuthSession
                              2. Busca tokens en blob
                              3. Inyecta como headers HTTP al container
                              4. nginx los expone en /_authinfo
                              5. SPA lee accessToken → envía como Bearer
```

**Configuración requerida:**
- Storage Account con container `tokenstore`
- SAS URL con permisos `rwdl` (read, write, delete, list)
- Secret `token-store-sas` en el Container App frontend
- `tokenStore.enabled: true` + `azureBlobStorage.sasUrlSettingName` en la auth config

---

### Flujo de Autenticación Paso a Paso

1. **Usuario visita el frontend** → Easy Auth intercepta el request (no hay cookie de sesión)
2. **Easy Auth redirige al OIDC login** → El usuario ve la pantalla de login (ciamlogin.com o login.microsoftonline.com)
3. **Usuario se autentica** → El OIDC provider envía un authorization code al callback (`/.auth/login/entraid/callback`)
4. **Easy Auth intercambia el code por tokens** → Obtiene `id_token` y `access_token` (el access_token tiene audience del backend porque se pidió el scope `api://{backend-client-id}/.default`)
5. **Tokens almacenados en Blob Storage** (Token Store) → Permite que `/.auth/me` funcione y que los headers `X-MS-TOKEN-*` estén disponibles
6. **Cookie `AppServiceAuthSession` seteada** → En requests posteriores, Easy Auth identifica al usuario por esta cookie
7. **En cada request autenticado**, Easy Auth inyecta headers:
   - `X-MS-CLIENT-PRINCIPAL`: JSON en base64 con claims del usuario (nombre, email, roles)
   - `X-MS-CLIENT-PRINCIPAL-ID`: ID del usuario
   - `X-MS-CLIENT-PRINCIPAL-NAME`: Nombre/email del usuario
   - `X-MS-CLIENT-PRINCIPAL-IDP`: Nombre del identity provider (`entraid`)
   - `X-MS-TOKEN-ENTRAID-ID-TOKEN`: El id_token completo
   - `X-MS-TOKEN-ENTRAID-ACCESS-TOKEN`: El access token para el backend API
8. **nginx `/_authinfo` endpoint** expone estos headers como JSON para que la SPA los lea
9. **La SPA lee `accessToken`** y lo envía como `Authorization: Bearer {accessToken}` en cada request al backend
10. **Backend Easy Auth** (configurado como AllowAnonymous) valida el Bearer token y, si es válido, inyecta `X-MS-CLIENT-PRINCIPAL`
11. **Código del backend** lee `X-MS-CLIENT-PRINCIPAL` → si es null retorna 401, si existe retorna los datos

### nginx `/_authinfo` endpoint

En `src/frontend/nginx.conf`:

```nginx
location = /_authinfo {
    default_type application/json;
    set $principal $http_x_ms_client_principal;
    set $principal_id $http_x_ms_client_principal_id;
    set $principal_name $http_x_ms_client_principal_name;
    set $principal_idp $http_x_ms_client_principal_idp;
    set $id_token $http_x_ms_token_entraid_id_token;
    set $access_token $http_x_ms_token_entraid_access_token;
    
    if ($principal = '') {
        return 200 '{"authenticated":false}';
    }
    return 200 '{"authenticated":true,"clientPrincipal":"$principal","userId":"$principal_id","userName":"$principal_name","identityProvider":"$principal_idp","idToken":"$id_token","accessToken":"$access_token"}';
}
```

**¿Por qué es necesario?** La SPA (React) corre en el browser y necesita saber quién es el usuario y obtener el access token para llamar al backend. Easy Auth inyecta los headers en el request HTTP que llega a nginx, pero JavaScript no puede leerlos directamente. Este endpoint los expone como JSON.

**Campos retornados:**
- `authenticated`: boolean
- `clientPrincipal`: base64 del JSON con claims completos
- `userId`: ID único del usuario
- `userName`: email o nombre
- `identityProvider`: `entraid`
- `idToken`: el id_token JWT completo
- `accessToken`: el access token para enviar al backend como Bearer

### Frontend App.tsx — Flujo de Autenticación

```typescript
// Al montar el componente, llama a /_authinfo
useEffect(() => { fetchUserInfo(); }, []);

const fetchUserInfo = async () => {
  const response = await fetch('/_authinfo');
  const data = await response.json();
  
  if (data.authenticated && data.clientPrincipal) {
    // Decodifica base64 → JSON con claims
    const decoded = JSON.parse(atob(data.clientPrincipal));
    const claims = decoded.claims || [];
    
    // Extrae nombre, email, roles de los claims
    setUserInfo({ isAuthenticated: true, name: ..., email: ..., roles: ... });
    
    // Guarda el accessToken para llamadas al backend
    if (data.accessToken) {
      setAccessToken(data.accessToken);
    }
  }
};

// Al llamar al backend, envía el Bearer token
const fetchWeather = async () => {
  const headers = {};
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }
  const response = await fetch(`${apiUrl}/weatherforecast`, {
    credentials: 'include',
    headers
  });
  // ...
};
```

### Backend Program.cs — Validación de Autenticación

```csharp
// Helper que lee X-MS-CLIENT-PRINCIPAL (inyectado por Easy Auth)
ClientPrincipal? GetClientPrincipal(HttpContext context)
{
    if (context.Request.Headers.TryGetValue("X-MS-CLIENT-PRINCIPAL", out var principalHeader))
    {
        var decoded = Convert.FromBase64String(principalHeader!);
        var json = Encoding.UTF8.GetString(decoded);
        return JsonSerializer.Deserialize<ClientPrincipal>(json);
    }
    return null;
}

// Endpoint protegido: retorna 401 si no hay principal
app.MapGet("/weatherforecast", (HttpContext context) =>
{
    var principal = GetClientPrincipal(context);
    
    if (principal == null)
    {
        return Results.Unauthorized();  // 401 si no hay token válido
    }
    
    // Obtener rol del usuario desde claims
    var userRole = principal.Claims?.FirstOrDefault(c => c.Typ == "roles")?.Val ?? "User";
    
    // Retornar datos con el rol
    var forecast = Enumerable.Range(1, 5).Select(index => new WeatherForecast(..., userRole));
    return Results.Ok(forecast);
});
```

**¿Por qué `AllowAnonymous` en el backend Easy Auth + 401 en código?**
- Si el backend usara `Return401` en Easy Auth, los requests CORS preflight (OPTIONS) serían rechazados con 401 → CORS falla
- Con `AllowAnonymous`, Easy Auth deja pasar todo pero **cuando hay un Bearer token válido**, lo valida y pone `X-MS-CLIENT-PRINCIPAL`
- El código decide: si no hay principal → 401; si hay → retorna datos

---

## Errores Comunes y Soluciones

| Error | Causa | Solución |
|-------|-------|----------|
| `AADSTS500208: domain not valid` | Usar `login.microsoftonline.com` con tenant CIAM | Usar Custom OIDC con `{tenant}.ciamlogin.com` en la discovery URL |
| `AADSTS50011: redirect URI mismatch` | Redirect URI en App Registration no coincide | Agregar `https://{fqdn}/.auth/login/entraid/callback` como **Web** (no SPA) |
| `/.auth/me` devuelve HTML en vez de JSON | Token Store no habilitado | Habilitar Token Store con Blob Storage SAS (ver Paso 1 y Paso 3) |
| 401 en backend sin Bearer token | El frontend no envía `Authorization: Bearer` | Verificar que Token Store está habilitado y que el scope `api://{backend-client-id}/.default` está en login scopes |
| CORS blocked (OPTIONS devuelve 401) | Backend Easy Auth configurado con `Return401` | Cambiar a `AllowAnonymous` y validar en código (ver backend authConfig) |
| `accessToken` vacío en `/_authinfo` | Token Store no configurado o falta scope | Verificar: 1) SAS URL correcta en secret `token-store-sas`, 2) scope `api://.../.default` en login scopes del frontend |
| SubStatus 73 (401 en callback) | `allowedApplications` configurado restrictivamente | **NO configurar** "Client application requirement" en la Authorization Policy |
| `/.auth/login/entraid/callback` devuelve 404 | Provider name no coincide | Verificar que el provider se llama exactamente `entraid` en la config (el callback path se genera del nombre) |
| Token Store error "blob not found" | Storage container no existe | Crear container `tokenstore` en el Storage Account |
| Login loop infinito | Client secret expirado o incorrecto | Regenerar client secret y actualizar el secret en Container App |

---

## Notas para Camuzzi (CMZ)

La configuración de CMZ es **IDÉNTICA** a la de POC-Fred con una ÚNICA diferencia:

```
# POC-Fred (CIAM):
OIDC_DISCOVERY="https://cognitomigration.ciamlogin.com/0a3af0e3-416b-4a6b-97e9-cb3a9a094449/v2.0/.well-known/openid-configuration"

# CMZ (Workforce):
OIDC_DISCOVERY="https://login.microsoftonline.com/{camuzzi-tenant-id}/v2.0/.well-known/openid-configuration"
```

**TODO lo demás es idéntico:**
- Mismo approach de Custom OIDC provider
- Mismo callback path: `/.auth/login/entraid/callback`
- Mismo nombre de provider: `entraid`
- Mismo Token Store con Blob Storage
- Mismo Bicep template (solo cambia el parámetro `oidcWellKnownUrl`)
- Mismo código frontend y backend

**No se necesita User Flow** en workforce — los usuarios ya existen en el directorio corporativo.

**Ventaja de usar Custom OIDC para ambos**: un solo Bicep, un solo código, un solo procedimiento. Solo cambia una URL.

---

## Variables por Entorno

| Variable | POC-Fred | CMZ Dev |
|----------|----------|---------|
| Auth Tenant ID | `0a3af0e3-416b-4a6b-97e9-cb3a9a094449` | `{camuzzi-tenant-id}` |
| OIDC Discovery URL | `https://cognitomigration.ciamlogin.com/0a3af0e3-416b-4a6b-97e9-cb3a9a094449/v2.0/.well-known/openid-configuration` | `https://login.microsoftonline.com/{camuzzi-tenant-id}/v2.0/.well-known/openid-configuration` |
| Frontend Client ID | `e9e60b6c-3b17-40f9-8722-0e2387fb232d` | `{por-crear}` |
| Backend Client ID | `9cbeba2f-de5d-42c5-b886-1f1395e59e3e` | `{por-crear}` |
| Backend API Scope | `api://9cbeba2f-de5d-42c5-b886-1f1395e59e3e/.default` | `api://{backend-client-id}/.default` |
| Usuario de prueba | `fartest@cognitomigration.onmicrosoft.com` | `{usuario-corporativo}` |
| Resource Group | `rg-far-container-app-easyauth` | `{camuzzi-rg}` |
| Token Store Storage | `stweathertokens` | `{camuzzi-storage}` |
| Frontend Container App | `ca-weather-fe-dev` | `ca-weather-fe-dev` |
| Backend Container App | `ca-weather-be-dev` | `ca-weather-be-dev` |
