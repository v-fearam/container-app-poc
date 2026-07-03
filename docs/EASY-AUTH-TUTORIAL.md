# Tutorial: Easy Auth con Roles en Azure Container Apps

Este tutorial te guía paso a paso para configurar **Easy Auth** con **Microsoft Entra ID** en tu frontend y backend, incluyendo configuración de **roles** que aparecerán en los tokens de acceso.

## 🎯 Objetivo

Al finalizar este tutorial:
- ✅ Frontend y Backend protegidos con Easy Auth
- ✅ Roles personalizados configurados en Entra ID
- ✅ Roles incluidos en el access token
- ✅ Frontend muestra usuario logueado + email
- ✅ Backend lee roles del token y los devuelve
- ✅ Frontend muestra el rol en los datos

## 📋 Requisitos Previos

- ✅ Frontend y Backend desplegados en Azure Container Apps
- ✅ Permisos de **Application Administrator** en Microsoft Entra ID
- ✅ Permisos de **Contributor** en los Container Apps

---

## Parte 1: Configurar App Registration con Roles

### Paso 1: Crear App Registration

```bash
# Obtener las URLs de tus apps
export RESOURCE_GROUP="rg-far-container-app-easyauth"

FRONTEND_URL=$(az containerapp show \
  --name ca-weather-fe-dev \
  --resource-group $RESOURCE_GROUP \
  --query 'properties.configuration.ingress.fqdn' -o tsv)

BACKEND_URL=$(az containerapp show \
  --name ca-weather-be-dev \
  --resource-group $RESOURCE_GROUP \
  --query 'properties.configuration.ingress.fqdn' -o tsv)

echo "Frontend: https://$FRONTEND_URL"
echo "Backend:  https://$BACKEND_URL"
```

### Paso 2: Registrar Frontend App en Entra ID

1. Azure Portal → **Microsoft Entra ID**
2. **App registrations** → **+ New registration**

**Name**: `ContainerApp-Weather-Frontend`

**Supported account types**: `Accounts in this organizational directory only (Single tenant)`

**Redirect URI**:
- Platform: **Web**
- URI: `https://<FRONTEND_URL>/.auth/login/aad/callback`

Ejemplo:
```
https://ca-weather-fe-dev.delightfulbush-6f1a4d43.eastus2.azurecontainerapps.io/.auth/login/aad/callback
```

3. Click **Register**

**Anotar**:
- **Application (client) ID**: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
- **Directory (tenant) ID**: `yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy`

### Paso 3: Configurar Roles en el App Registration

1. En tu App Registration, ve a **App roles**
2. Click **+ Create app role**

**Rol Admin**:
- **Display name**: `Admin`
- **Allowed member types**: `Users/Groups`
- **Value**: `Admin`
- **Description**: `Administrator role with full access`
- **Enable this app role**: ☑️
- Click **Apply**

**Rol User**:
- **Display name**: `User`
- **Allowed member types**: `Users/Groups`
- **Value**: `User`
- **Description**: `Standard user role`
- **Enable this app role**: ☑️
- Click **Apply**

### Paso 4: Configurar Token Configuration

1. En el App Registration, ve a **Token configuration**
2. Click **+ Add optional claim**
3. **Token type**: `Access`
4. Selecciona los claims:
   - ☑️ **email**
   - ☑️ **family_name**
   - ☑️ **given_name**
   - ☑️ **upn**
5. Click **Add**

6. Click **+ Add groups claim**
7. Selecciona **Security groups**
8. **Customize token properties by type**:
   - ID: ☑️ **Group ID**
   - Access: ☑️ **Group ID**
9. Click **Add**

### Paso 5: Configurar API Permissions

1. Ve a **API permissions**
2. Click **+ Add a permission**
3. **Microsoft Graph** → **Delegated permissions**
4. Busca y selecciona:
   - ☑️ **User.Read** (para leer perfil del usuario)
   - ☑️ **email**
   - ☑️ **profile**
   - ☑️ **openid**
5. Click **Add permissions**
6. Click **Grant admin consent for [Your Organization]**
7. Confirma **Yes**

### Paso 6: Crear Client Secret

1. Ve a **Certificates & secrets**
2. **Client secrets** → **+ New client secret**
3. **Description**: `Frontend-Secret-2026`
4. **Expires**: `12 months`
5. Click **Add**
6. **⚠️ COPIA EL VALUE AHORA** (solo se muestra una vez)

### Paso 7: Habilitar ID Tokens

1. Ve a **Authentication**
2. En **Implicit grant and hybrid flows**:
   - ☑️ **ID tokens**
3. Click **Save**

---

## Parte 2: Asignar Roles a Usuarios

### Paso 1: Ir a Enterprise Applications

1. Azure Portal → **Microsoft Entra ID**
2. **Enterprise applications**
3. Busca `ContainerApp-Weather-Frontend`
4. Click en la aplicación

### Paso 2: Requerir Asignación de Usuarios

1. Ve a **Properties**
2. **Assignment required?** → **Yes**
3. Click **Save**

Ahora solo usuarios asignados podrán acceder.

### Paso 3: Asignar tu Usuario con Rol

1. Ve a **Users and groups**
2. Click **+ Add user/group**
3. **Users**: Click **None Selected**
   - Busca tu usuario (tu email)
   - Selecciónalo
   - Click **Select**
4. **Select a role**: Click **None Selected**
   - Selecciona **Admin** (o **User**)
   - Click **Select**
5. Click **Assign**

✅ Ahora tu usuario tiene el rol **Admin** asignado.

### Paso 4: Verificar el Rol Asignado

```bash
# Via Azure CLI (opcional)
az ad sp show --id <APPLICATION_ID> --query appRoles
```

---

## Parte 3: Configurar Easy Auth en el Frontend

### Via Azure Portal

1. Azure Portal → **Container Apps**
2. Selecciona **ca-weather-fe-dev**
3. En el menú izquierdo, bajo **Security** → **Authentication**
4. Click **Add identity provider**
5. **Identity provider**: **Microsoft**

**App registration type**:
- **Provide the details of an existing app registration**

**Application (client) ID**:
- Pega el Client ID del Paso 1.2

**Client secret**:
- Pega el secret del Paso 1.6

**Issuer URL**:
```
https://login.microsoftonline.com/<TENANT_ID>/v2.0
```

**Allowed token audiences** (importante para roles):
```
api://<CLIENT_ID>
<CLIENT_ID>
```

**Restrict access**: **Require authentication**

**Unauthenticated requests**: **HTTP 302 Found redirect**

**Token store**: ☑️ **Enabled**

6. Click **Add**

---

## Parte 4: Configurar Backend API

### Paso 1: Registrar Backend App (opcional pero recomendado)

1. Azure Portal → **Microsoft Entra ID** → **App registrations**
2. **+ New registration**

**Name**: `ContainerApp-Weather-Backend-API`

**Supported account types**: `Accounts in this organizational directory only`

**Redirect URI**:
- Platform: **Web**
- URI: `https://<BACKEND_URL>/.auth/login/aad/callback`

3. Click **Register**

### Paso 2: Exponer API

1. En el Backend App Registration, ve a **Expose an API**
2. **Application ID URI** → **Add**
3. Usa: `api://weather-backend` (o acepta el default)
4. Click **Save**

### Paso 3: Agregar Scope

1. Click **+ Add a scope**
2. **Scope name**: `Weather.Read`
3. **Who can consent**: **Admins and users**
4. **Admin consent display name**: `Read weather data`
5. **Admin consent description**: `Allows the app to read weather forecast data`
6. **User consent display name**: `Read weather data`
7. **User consent description**: `Allows the app to read weather forecast on your behalf`
8. **State**: **Enabled**
9. Click **Add scope**

### Paso 4: Autorizar Frontend a Llamar Backend

1. Ve al **Frontend App Registration**
2. **API permissions** → **+ Add a permission**
3. **My APIs** → Selecciona **ContainerApp-Weather-Backend-API**
4. **Delegated permissions** → ☑️ **Weather.Read**
5. Click **Add permissions**
6. Click **Grant admin consent**

### Paso 5: Configurar Easy Auth en Backend

1. Azure Portal → Container Apps → **ca-weather-be-dev**
2. En el menú izquierdo, bajo **Security** → **Authentication**
3. **Add identity provider** → **Microsoft**
4. **App registration type**: **Provide the details of an existing app registration**
5. **Application (client) ID**: Backend Client ID
6. **Client secret**: (crear uno en Backend App Registration)
7. **Issuer URL**: `https://login.microsoftonline.com/<TENANT_ID>/v2.0`
8. **Allowed token audiences**:
```
api://weather-backend
<BACKEND_CLIENT_ID>
```
9. **Restrict access**: **Require authentication**
10. Click **Add**

---

## Parte 5: Verificar que los Roles Aparecen en el Token

### Opción 1: Via Portal (/.auth/me)

1. Abre el frontend en el navegador (serás redirigido a login)
2. Inicia sesión con tu usuario
3. Una vez autenticado, navega a:
```
https://<FRONTEND_URL>/.auth/me
```

4. Busca en el JSON la sección `roles`:
```json
{
  "claims": [
    ...
    {
      "typ": "roles",
      "val": "Admin"
    }
  ]
}
```

### Opción 2: Decodificar el Token

1. En el navegador (con sesión iniciada), abre DevTools → Application → Cookies
2. Busca la cookie `AppServiceAuthSession`
3. Cópiala
4. Usa `curl` para obtener el token:

```bash
curl -H "Cookie: AppServiceAuthSession=<cookie-value>" \
  https://<FRONTEND_URL>/.auth/me
```

5. Busca el claim `roles` en la respuesta

---

## Parte 6: Modificar la Aplicación para Usar Roles

### Backend: Leer Roles del Header

El backend recibirá el header `X-MS-CLIENT-PRINCIPAL` con información del usuario.

**Formato del header** (Base64 encoded JSON):
```json
{
  "auth_typ": "aad",
  "claims": [
    {"typ": "roles", "val": "Admin"},
    {"typ": "name", "val": "John Doe"},
    {"typ": "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress", "val": "john@contoso.com"}
  ],
  "name_typ": "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
  "role_typ": "http://schemas.microsoft.com/ws/2008/06/identity/claims/role"
}
```

### Frontend: Obtener Info del Usuario

El frontend puede llamar a `/.auth/me` para obtener la información del usuario logueado.

---

## 🧪 Testing

### Test 1: Verificar Autenticación

```bash
# Sin autenticación (debe redirigir)
curl -I https://<FRONTEND_URL>

# Debe devolver HTTP 302 con Location: login.microsoftonline.com
```

### Test 2: Verificar Roles

1. Login en el navegador
2. Abre DevTools → Console
3. Ejecuta:
```javascript
fetch('/.auth/me')
  .then(r => r.json())
  .then(d => console.log(d[0].user_claims.find(c => c.typ === 'roles')))
```

Deberías ver: `{typ: "roles", val: "Admin"}`

---

## 🔧 Troubleshooting

### Problema: Roles no aparecen en el token

**Solución**:
1. Verifica que asignaste el rol al usuario en **Enterprise Applications** → **Users and groups**
2. Verifica **Token configuration** → **Optional claims** → Access token tiene los claims necesarios
3. Cierra sesión y vuelve a iniciar (/.auth/logout)

### Problema: "AADSTS50105: The signed in user is not assigned to a role"

**Solución**:
1. Ve a **Enterprise applications** → Tu app
2. **Users and groups** → Verifica que tu usuario está asignado
3. Verifica que tiene un **rol** asignado (no solo acceso)

### Problema: Frontend no puede llamar al Backend

**Solución**:
1. Verifica que el Frontend tiene permiso en **API permissions** para llamar al Backend
2. Verifica que el Backend tiene el `Issuer URL` y `Allowed token audiences` correctos
3. Verifica CORS en el backend

---

## 📚 Recursos

- [Container Apps Authentication](https://learn.microsoft.com/en-us/azure/container-apps/authentication)
- [App Roles Documentation](https://learn.microsoft.com/en-us/entra/identity-platform/howto-add-app-roles-in-apps)
- [Access User Claims](https://learn.microsoft.com/en-us/azure/app-service/configure-authentication-user-identities)

## ✅ Checklist

- [ ] App Registration creado para Frontend
- [ ] Roles (Admin, User) creados en App roles
- [ ] Token configuration con optional claims configurado
- [ ] Client secret creado
- [ ] Usuario asignado con rol Admin
- [ ] Easy Auth habilitado en Frontend
- [ ] Easy Auth habilitado en Backend (opcional)
- [ ] Roles aparecen en `/.auth/me`
- [ ] Frontend muestra usuario logueado
- [ ] Backend lee roles del header X-MS-CLIENT-PRINCIPAL
- [ ] Frontend muestra rol que viene del backend

🎉 ¡Listo! Ahora tu aplicación usa Easy Auth con roles.
