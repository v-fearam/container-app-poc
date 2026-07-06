# Guía Completa: Easy Auth para SPA con Tenant Externo

## 🎯 Tu Escenario Específico

### Arquitectura
```
Browser (Usuario) 
  ↓
  → Frontend Container App (Easy Auth ON) → Login en Tenant Externo
  ↓
  → Backend Container App (Easy Auth ON, público) → Valida tokens del Tenant Externo
```

### Tenants Involucrados

1. **Tenant de Azure Resources** (donde están los Container Apps):
   - Tenant ID: `b9ccb062-1a4e-421f-a3da-0a738577137d`
   - Uso: Solo para deployar infraestructura
   - **NO usás este tenant para autenticación**

2. **Tenant Externo "Cognito Migration"** (para usuarios y apps):
   - Tenant ID: `0a3af0e3-416b-4a6b-97e9-cb3a9a094449`
   - Uso: App Registrations, Roles, Usuarios
   - **SÍ usás este tenant para autenticación**

### ⚠️ Aclaración Importante: Por Qué Backend Necesita Easy Auth

**Pregunta**: ¿Por qué el Backend necesita Easy Auth si el Frontend ya autenticó?

**Respuesta**: Porque tu Frontend es una **SPA (Single Page Application)**:
1. El **JavaScript corre en el browser del usuario** (no en Azure)
2. El **browser está en internet público**
3. El browser hace `fetch()` **directamente** al Backend desde internet
4. El header `X-MS-CLIENT-PRINCIPAL` solo lo inyecta **Easy Auth del mismo Container App**
5. Si el Backend NO tiene Easy Auth, **NO recibe el header** porque el request viene del browser, no del Frontend Container App

**Flujo Real**:
```
Browser → fetch(backend-url) → Backend Container App
          ↑ Este request viene de internet público, NO del Frontend Container App
```

**Por lo tanto**: Backend DEBE tener Easy Auth para:
- Validar el access token que el browser envía
- Inyectar el header `X-MS-CLIENT-PRINCIPAL` con la info del usuario
- Tu código parsea ese header y extrae roles

---

## 📋 Preparación (Antes de Empezar)

### Paso 0: Obtener URLs y Variables

⚠️ **IMPORTANTE**: Ejecutá estos comandos primero y guardá los valores. Los usarás en TODOS los pasos siguientes.

```bash
# 1. Configurar Resource Group
export RESOURCE_GROUP="rg-far-container-app-easyauth"

# 2. Obtener URLs de los Container Apps
export FRONTEND_URL=$(az containerapp show \
  --name ca-weather-fe-dev \
  --resource-group $RESOURCE_GROUP \
  --query 'properties.configuration.ingress.fqdn' -o tsv)

export BACKEND_URL=$(az containerapp show \
  --name ca-weather-be-dev \
  --resource-group $RESOURCE_GROUP \
  --query 'properties.configuration.ingress.fqdn' -o tsv)

# 3. Tenant Externo (para autenticación)
export AUTH_TENANT_ID="0a3af0e3-416b-4a6b-97e9-cb3a9a094449"  # Cognito Migration

# 4. Mostrar valores
echo "=== VARIABLES PARA EASY AUTH ==="
echo "Frontend URL: https://$FRONTEND_URL"
echo "Backend URL:  https://$BACKEND_URL"
echo "Auth Tenant:  $AUTH_TENANT_ID"
echo "================================"
```

**Ejemplo de resultado** (tus URLs serán diferentes en cada deployment):
```
=== VARIABLES PARA EASY AUTH ===
Frontend URL: https://ca-weather-fe-dev.delightfulcliff-4c3aef98.eastus2.azurecontainerapps.io
Backend URL:  https://ca-weather-be-dev.delightfulcliff-4c3aef98.eastus2.azurecontainerapps.io
Auth Tenant:  0a3af0e3-416b-4a6b-97e9-cb3a9a094449
================================
```

📝 **Copiá estos valores** - los necesitarás para los Redirect URIs en los próximos pasos.

### Información del Tenant Externo

- **Tenant Name**: Cognito Migration
- **Tenant ID**: `0a3af0e3-416b-4a6b-97e9-cb3a9a094449`
- **Uso**: App Registrations, Roles, Usuarios
- **Permisos necesarios**: Application Administrator (para crear App Registrations)

---

## Parte 1: Crear App Registration para Frontend

### Paso 1.1: Asegurarte de Estar en el Tenant Correcto

1. Azure Portal → Click en tu perfil (arriba derecha)
2. **Switch directory**
3. Seleccionar: **Cognito Migration** (tenant `0a3af0e3-416b-4a6b-97e9-cb3a9a094449`)

### Paso 1.2: Crear App Registration

1. Azure Portal → **Microsoft Entra ID**
2. **App registrations** → **+ New registration**

**Configuración**:
```
Name: ContainerApp-Weather-Frontend
Supported account types: Single tenant only - Cognito Migration
Redirect URI:
  - Platform: Web
  - URI: https://<FRONTEND_URL>/.auth/login/aad/callback
```

**Usá tu FRONTEND_URL** del Paso 0. Ejemplo:
```
https://ca-weather-fe-dev.delightfulcliff-4c3aef98.eastus2.azurecontainerapps.io/.auth/login/aad/callback
```

⚠️ **Importante**: 
- Copiá la URL exacta de tu variable `$FRONTEND_URL`
- Agregá `https://` al inicio
- Agregá `/.auth/login/aad/callback` al final
- Sin barra final después de "callback"

💡 **¿Por qué "Web" y no "Single-page application (SPA)"?**

Aunque tu frontend es una **SPA React**, usá **Platform Type: Web** porque:
- Easy Auth maneja el OAuth flow **server-side** (sidecar en Container Apps)
- El callback `/.auth/login/aad/callback` lo procesa **Easy Auth** (servidor), NO tu JavaScript
- Easy Auth usa **authorization code flow** (server-side), no PKCE
- "Single-page application (SPA)" solo se usa cuando hacés auth directamente desde el browser con MSAL.js (sin Easy Auth)

**Flujo con Easy Auth**:
```
Browser → Easy Auth (servidor) → Entra ID → Easy Auth (servidor) → Browser
          ↑ OAuth flow manejado server-side por Easy Auth
```

**Flujo SIN Easy Auth** (no es tu caso):
```
Browser (MSAL.js) → Entra ID → Browser (MSAL.js)
↑ OAuth flow manejado en el browser con PKCE
```

3. Click **Register**

### Paso 1.3: Anotar IDs

En la página **Overview** del App Registration:

```
Application (client) ID: ______________________________________
Directory (tenant) ID:   0a3af0e3-416b-4a6b-97e9-cb3a9a094449 (verificar)
```

### Paso 1.4: Habilitar ID Tokens

1. En el App Registration, ve a **Authentication** (menú izquierdo)
2. En **Implicit grant and hybrid flows**:
   - ☑️ **ID tokens (used for implicit and hybrid flows)**
3. Click **Save**

⚠️ **CRÍTICO**: Sin esto, Easy Auth da error 401.

### Paso 1.5: Crear Client Secret

1. Ve a **Certificates & secrets**
2. **Client secrets** → **+ New client secret**
3. **Description**: `Frontend-Secret-2026`
4. **Expires**: `12 months`
5. Click **Add**
6. **⚠️ COPIA EL VALUE AHORA**:

```
Client Secret Value: _______________________________________________
```

### Paso 1.6: Configurar App Roles

1. Ve a **App roles**
2. Click **+ Create app role**

**Rol Admin**:
```
Display name: Admin
Allowed member types: Users/Groups
Value: Admin
Description: Administrator role with full access
Enable this app role: ☑️
```
Click **Apply**

**Rol User**:
```
Display name: User
Allowed member types: Users/Groups
Value: User
Description: Standard user role
Enable this app role: ☑️
```
Click **Apply**

### Paso 1.7: Configurar Token Configuration (Roles en Token)

1. Ve a **Token configuration**
2. Click **+ Add optional claim**
3. **Token type**: `Access`
4. Selecciona:
   - ☑️ **email**
   - ☑️ **family_name**
   - ☑️ **given_name**
   - ☑️ **upn**
5. Click **Add**

---

## Parte 2: Crear App Registration para Backend (API)

### Paso 2.1: Crear App Registration

1. Azure Portal → **Microsoft Entra ID** → **App registrations**
2. **+ New registration**

**Configuración**:
```
Name: ContainerApp-Weather-Backend-API
Supported account types: Single tenant only - Cognito Migration
Redirect URI:
  - Platform: Web
  - URI: https://<BACKEND_URL>/.auth/login/aad/callback
```

**Usá tu BACKEND_URL** del Paso 0. Ejemplo:
```
https://ca-weather-be-dev.delightfulcliff-4c3aef98.eastus2.azurecontainerapps.io/.auth/login/aad/callback
```

💡 **Nota**: También usá **Platform Type: Web** (igual que el Frontend) porque Easy Auth es server-side.

3. Click **Register**

### Paso 2.2: Anotar IDs

```
Application (client) ID (Backend): ______________________________________
Directory (tenant) ID:             0a3af0e3-416b-4a6b-97e9-cb3a9a094449 (verificar)
```

### Paso 2.3: Habilitar ID Tokens

1. **Authentication** → **Implicit grant and hybrid flows**
2. ☑️ **ID tokens**
3. Click **Save**

### Paso 2.4: Exponer API

1. Ve a **Expose an API**
2. **Application ID URI** → Click **Add**
3. **Acepta el default**: `api://<BACKEND_CLIENT_ID>`
   - Ejemplo: `api://e36880cc-f3s5-4e33-ae82-a88f6cdb632f`
4. Click **Save**

⚠️ **IMPORTANTE**: Usá el formato `api://<CLIENT_ID>`, NO custom como `api://weather-backend`.

### Paso 2.5: Agregar Scope

1. Click **+ Add a scope**

**Configuración**:
```
Scope name: Weather.Read
Who can consent: Admins and users
Admin consent display name: Read weather data
Admin consent description: Allows the app to read weather forecast data
User consent display name: Read weather data
User consent description: Allows the app to read weather forecast on your behalf
State: Enabled
```

2. Click **Add scope**

3. **Verificá que aparezca**:
   - Scope: `api://<BACKEND_CLIENT_ID>/Weather.Read`

### Paso 2.6: Autorizar al Frontend (Pre-authorize)

1. En **Expose an API**, baja a **Authorized client applications**
2. Click **+ Add a client application**

**Configuración**:
```
Client ID: <FRONTEND_CLIENT_ID>
Authorized scopes: ☑️ api://<BACKEND_CLIENT_ID>/Weather.Read
```

3. Click **Add application**

⚠️ **CRÍTICO**: Este paso hace que el Frontend pueda llamar al Backend sin prompt de consentimiento.

### Paso 2.7: Crear Client Secret para Backend

1. **Certificates & secrets** → **+ New client secret**
2. **Description**: `Backend-Secret-2026`
3. **Expires**: `12 months`
4. Click **Add**
5. **⚠️ COPIA EL VALUE**:

```
Backend Client Secret: _______________________________________________
```

---

## Parte 3: Agregar Permisos al Frontend para Llamar al Backend

### Paso 3.1: Configurar API Permissions

1. Ve al **Frontend App Registration** (`ContainerApp-Weather-Frontend`)
2. **API permissions** → **+ Add a permission**
3. **My APIs** → Selecciona **ContainerApp-Weather-Backend-API**
   
   ⚠️ Si NO aparece: Esperá 2-3 minutos y refrescá la página (propagación de Azure AD)

4. **Delegated permissions** → ☑️ **Weather.Read**
5. Click **Add permissions**

### Paso 3.2: Grant Admin Consent

1. En **API permissions**, click **Grant admin consent for [Cognito Migration]**
2. Confirma **Yes**

**Verificá que diga**:
```
Status: ✅ Granted for Cognito Migration
```

---

## Parte 4: Asignar Roles a Usuarios

### Paso 4.1: Ir a Enterprise Applications

1. Azure Portal → **Microsoft Entra ID**
2. **Enterprise applications**
3. **All applications** → Busca `ContainerApp-Weather-Frontend`
4. Click en la aplicación

### Paso 4.2: Requerir Asignación

1. Ve a **Properties**
2. **Assignment required?** → **Yes**
3. Click **Save**

### Paso 4.3: Asignar tu Usuario con Rol

1. Ve a **Users and groups**
2. Click **+ Add user/group**
3. **Users**: Click **None Selected**
   - Busca tu usuario (email)
   - Selecciónalo
   - Click **Select**
4. **Select a role**: Click **None Selected**
   - Selecciona **Admin**
   - Click **Select**
5. Click **Assign**

---

## Parte 5: Configurar Easy Auth en el Frontend Container App

### Paso 5.1: Remover Configuración Anterior (si existe)

```bash
# Limpiar configuración anterior
az containerapp auth microsoft remove \
  --name ca-weather-fe-dev \
  --resource-group rg-far-container-app-easyauth
```

### Paso 5.2: Configurar Easy Auth (via Portal)

1. Azure Portal → **Container Apps** → **ca-weather-fe-dev**
2. **Security** → **Authentication**
3. Click **Add identity provider**
4. **Identity provider**: **Microsoft**

**Configuración**:
```
Tenant type: Workforce

App registration type: Provide the details of an existing app registration

Application (client) ID: <FRONTEND_CLIENT_ID>

Client secret: <FRONTEND_CLIENT_SECRET>

Issuer URL: https://login.microsoftonline.com/0a3af0e3-416b-4a6b-97e9-cb3a9a094449/v2.0

Allowed token audiences:
  <FRONTEND_CLIENT_ID>
  api://<FRONTEND_CLIENT_ID>
```

💡 **¿Qué es "Tenant type"?**
- **Workforce** ← **Usá esta**: Para cuentas de trabajo/escuela (Microsoft Entra ID) o Microsoft accounts (Outlook.com, Live.com)
  - Tu caso: Usuarios en el tenant "Cognito Migration"
- **Customer (Preview)**: Para Azure AD B2C, identidades de consumidores, social accounts (Facebook, Google)
  - NO uses esta opción

⚠️ **CRÍTICO**: 
- Usá `login.microsoftonline.com`, NO `sts.windows.net`
- Usá el tenant ID correcto: `0a3af0e3-416b-4a6b-97e9-cb3a9a094449`

**Additional checks**:
```
Client application requirement: Allow requests only from this application itself
Identity requirement: Allow requests from any identity
```

💡 **¿Qué significan estos checks?**
- **Client application requirement**:
  - ✅ "Allow requests only from this application itself" ← Recomendado para single app
  - ❌ "Allow requests from specific client applications" - Solo si tenés múltiples apps
  - ❌ "Allow requests from any application" - NUNCA, inseguro
  
- **Identity requirement**:
  - ✅ "Allow requests from any identity" ← Recomendado (manejás usuarios en Enterprise Apps)
  - ❌ "Allow requests from specific identities" - Solo si querés hardcodear usuarios

**Authentication settings**:
```
Restrict access: Require authentication
Unauthenticated requests: HTTP 302 Found redirect: recommended for websites
Token store: Enabled
```

5. Click **Add**

---

## Parte 6: Configurar Easy Auth en el Backend Container App

### Paso 6.1: Remover Configuración Anterior (si existe)

```bash
# Limpiar configuración anterior
az containerapp auth microsoft remove \
  --name ca-weather-be-dev \
  --resource-group rg-far-container-app-easyauth
```

### Paso 6.2: Configurar Easy Auth (via Portal)

1. Azure Portal → **Container Apps** → **ca-weather-be-dev**
2. **Security** → **Authentication**
3. Click **Add identity provider**
4. **Identity provider**: **Microsoft**

**Configuración**:
```
Tenant type: Workforce

App registration type: Provide the details of an existing app registration

Application (client) ID: <BACKEND_CLIENT_ID>

Client secret: <BACKEND_CLIENT_SECRET>

Issuer URL: https://login.microsoftonline.com/0a3af0e3-416b-4a6b-97e9-cb3a9a094449/v2.0

Allowed token audiences:
  <BACKEND_CLIENT_ID>
  api://<BACKEND_CLIENT_ID>
```

⚠️ **CRÍTICO**: Mismo tenant ID que el Frontend.

**Additional checks**:
```
Client application requirement: Allow requests only from this application itself
Identity requirement: Allow requests from any identity
```

**Authentication settings**:
```
Restrict access: Require authentication
Unauthenticated requests: HTTP 401 Unauthorized: recommended for APIs
Token store: Enabled
```

5. Click **Add**

---

## Parte 7: Actualizar el Frontend para Enviar Access Token

### Paso 7.1: Modificar App.tsx

El Frontend necesita obtener el **access token** y enviarlo al Backend.

**Actualizar `src/frontend/src/App.tsx`**:

```typescript
// Al inicio del archivo
const [accessToken, setAccessToken] = useState<string | null>(null);

// Nueva función para obtener access token
const getAccessToken = async (): Promise<string | null> => {
  try {
    const response = await fetch('/.auth/me', {
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error('Failed to get auth info');
    }
    
    const authInfo = await response.json();
    if (authInfo && authInfo.length > 0) {
      return authInfo[0].access_token;
    }
    
    return null;
  } catch (error) {
    console.error('Error getting access token:', error);
    return null;
  }
};

// Modificar fetchWeather para enviar access token
const fetchWeather = async () => {
  try {
    setLoading(true);
    setError(null);

    const apiUrl = import.meta.env.VITE_API_URL;
    if (!apiUrl) {
      setError("API URL not configured");
      return;
    }

    // Obtener access token
    const token = await getAccessToken();
    
    if (!token) {
      setError("No access token available");
      return;
    }

    const headers: HeadersInit = {
      'Accept': 'application/json',
    };
    
    // Enviar token en Authorization header
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${apiUrl}/weatherforecast`, {
      method: 'GET',
      headers: headers,
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    setForecasts(data);
  } catch (err) {
    setError(err instanceof Error ? err.message : "Failed to fetch weather data");
    console.error("Error fetching weather:", err);
  } finally {
    setLoading(false);
  }
};

// Similar para fetchUserInfo
const fetchUserInfo = async () => {
  try {
    const apiUrl = import.meta.env.VITE_API_URL;
    if (!apiUrl) {
      setUserInfo({
        name: "API URL not configured",
        email: "",
        roles: []
      });
      return;
    }

    // Obtener access token
    const token = await getAccessToken();
    
    if (!token) {
      setUserInfo({
        name: "No access token",
        email: "",
        roles: []
      });
      return;
    }

    const headers: HeadersInit = {
      'Accept': 'application/json',
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${apiUrl}/userinfo`, {
      method: 'GET',
      headers: headers,
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data: UserInfo = await response.json();
    setUserInfo(data);
  } catch (err) {
    setUserInfo({
      name: "Error loading user info",
      email: err instanceof Error ? err.message : "Unknown error",
      roles: []
    });
    console.error("Error fetching user info:", err);
  }
};
```

---

## Parte 8: Rebuild y Deploy

### Paso 8.1: Rebuild Frontend con Cambios

```bash
export AZURE_RESOURCE_GROUP="rg-far-container-app-easyauth"
ACR_NAME=$(az deployment group show \
  --resource-group $AZURE_RESOURCE_GROUP \
  --name main \
  --query 'properties.outputs.acrName.value' -o tsv)

# Rebuild frontend
az acr build --registry $ACR_NAME \
  --image camuzzi-weather-frontend:latest \
  --file src/frontend/Dockerfile \
  src/frontend

# Rebuild backend (CORS ya está OK)
az acr build --registry $ACR_NAME \
  --image camuzzi-weather-backend:latest \
  --file src/backend/WeatherApi/Dockerfile \
  src/backend/WeatherApi

# Restart apps
az containerapp revision restart \
  --name ca-weather-fe-dev \
  --resource-group $AZURE_RESOURCE_GROUP

az containerapp revision restart \
  --name ca-weather-be-dev \
  --resource-group $AZURE_RESOURCE_GROUP
```

---

## Parte 9: Testing

### Test 1: Frontend Login

1. Abre tu Frontend URL (la que copiaste en el Paso 0):
   ```bash
   echo "https://$FRONTEND_URL"
   ```
   
   Ejemplo: `https://ca-weather-fe-dev.delightfulcliff-4c3aef98.eastus2.azurecontainerapps.io`

2. Deberías ser redirigido a: `login.microsoftonline.com`
3. Login con tu usuario del tenant externo
4. Deberías volver al frontend **sin error 401**

### Test 2: Verificar Access Token

En el frontend logueado, abre DevTools → Console:

```javascript
fetch('/.auth/me', { credentials: 'include' })
  .then(r => r.json())
  .then(d => console.log(d[0].access_token))
```

Deberías ver un **JWT token** largo.

### Test 3: Verificar Roles en Token

```javascript
fetch('/.auth/me', { credentials: 'include' })
  .then(r => r.json())
  .then(d => {
    const roles = d[0].user_claims.filter(c => c.typ === 'roles');
    console.log('Roles:', roles);
  })
```

Deberías ver: `[{typ: "roles", val: "Admin"}]`

### Test 4: Backend Recibe Token

El Backend debería:
- Recibir el `Authorization: Bearer <token>` header del browser
- Easy Auth valida el token
- Easy Auth inyecta `X-MS-CLIENT-PRINCIPAL`
- Tu código parsea el header y extrae roles

---

## 🐛 Troubleshooting

### Error 401 en Callback

**Síntoma**: `https://.../auth/login/aad/callback` → HTTP ERROR 401

**Causas**:
1. ❌ **ID tokens no habilitados**
   - Solución: App Registration → Authentication → ☑️ ID tokens → Save

2. ❌ **Tenant ID incorrecto en Issuer URL**
   - Solución: Verificar que sea `0a3af0e3-416b-4a6b-97e9-cb3a9a094449`

3. ❌ **Redirect URI no coincide**
   - Solución: Debe ser exactamente igual (con/sin trailing slash importa)

4. ❌ **Client secret expirado o incorrecto**
   - Solución: Crear nuevo secret y actualizar Container App

### Backend No Aparece en "My APIs"

**Síntoma**: Al agregar permisos en Frontend, el Backend no aparece en "My APIs"

**Causas**:
1. ❌ **No exponiste el API** (Expose an API → Application ID URI)
2. ❌ **No agregaste un scope** (Weather.Read)
3. ❌ **Propagación** - Esperá 2-3 minutos y refrescá

### Error CORS

**Síntoma**: `Access-Control-Allow-Credentials must be 'true'`

**Solución**: El código ya tiene `AllowCredentials()` en CORS. Solo asegurate de rebuild.

### Backend No Recibe `X-MS-CLIENT-PRINCIPAL`

**Síntoma**: Header vacío, rol = "Anonymous"

**Causas**:
1. ❌ **Backend NO tiene Easy Auth** - Debe tenerlo para SPAs
2. ❌ **Frontend no envía Authorization header** - Verificá código de App.tsx
3. ❌ **Token inválido** - Verificá que Frontend y Backend usen mismo tenant

---

## ✅ Checklist Final

**App Registrations**:
- [ ] Frontend App creado en tenant externo
- [ ] Backend App creado en tenant externo
- [ ] Ambos tienen ID tokens habilitados
- [ ] Ambos tienen client secrets creados y copiados
- [ ] Backend tiene API expuesta (Application ID URI)
- [ ] Backend tiene scope Weather.Read
- [ ] Backend tiene Frontend pre-autorizado (Authorized client applications)
- [ ] Frontend tiene permiso Weather.Read (API permissions)
- [ ] Admin consent granted

**Roles y Usuarios**:
- [ ] Roles Admin y User creados en Frontend App
- [ ] Token configuration tiene optional claims
- [ ] Usuario asignado con rol Admin en Enterprise Application

**Container Apps**:
- [ ] Frontend Easy Auth configurado con tenant externo
- [ ] Backend Easy Auth configurado con tenant externo
- [ ] Ambos usan Issuer URL con tenant externo
- [ ] Ambos tienen Allowed token audiences correctos

**Código**:
- [ ] Frontend modificado para obtener y enviar access token
- [ ] Backend tiene CORS con AllowCredentials
- [ ] Backend parsea X-MS-CLIENT-PRINCIPAL

**Deploy**:
- [ ] Frontend rebuild y restart
- [ ] Backend rebuild y restart

**Testing**:
- [ ] Login funciona sin error 401
- [ ] `/.auth/me` devuelve access token
- [ ] Roles aparecen en user_claims
- [ ] Frontend muestra usuario + email + roles
- [ ] Weather forecast devuelve datos con roles

---

## 📚 Referencias Oficiales

- [Container Apps Authentication](https://learn.microsoft.com/en-us/azure/container-apps/authentication) - Arquitectura y flujos
- [Enable Authentication with Entra ID](https://learn.microsoft.com/en-us/azure/container-apps/authentication-entra) - Configuración de Entra ID
- [Daemon Client Applications](https://learn.microsoft.com/en-us/azure/container-apps/authentication-entra#daemon-client-application-service-to-service-calls) - Service-to-service auth
- [Access User Claims](https://learn.microsoft.com/en-us/azure/app-service/configure-authentication-user-identities) - Headers y claims

---

**Última actualización**: 2026-07-03 16:52
**Escenario**: SPA + Backend público + Tenant externo para autenticación
**Approach**: Easy Auth en Frontend + Backend con OAuth scopes
