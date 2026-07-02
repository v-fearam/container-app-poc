# Tutorial: Configurar Easy Auth con Microsoft Entra ID en Azure Container Apps

Este tutorial te guiará paso a paso en la configuración de autenticación y autorización (Easy Auth) utilizando Microsoft Entra ID (anteriormente Azure Active Directory) para proteger tu Container App.

## 📋 Requisitos Previos

- ✅ Container App desplegado (usando `biceps/main.bicep`)
- ✅ Acceso al Azure Portal con permisos de:
  - Contributor en el Container App
  - Application Administrator en Microsoft Entra ID
- ✅ Una cuenta de Azure con tenant de Microsoft Entra ID

## 🎯 Objetivo

Al finalizar este tutorial, tu Container App:
- ✅ Requerirá autenticación para acceder
- ✅ Los usuarios se autenticarán con sus cuentas Microsoft/Azure AD
- ✅ La aplicación recibirá información del usuario autenticado en headers HTTP
- ✅ Podrás controlar qué usuarios tienen acceso

---

## Método 1: Configuración Automática (Recomendado para POCs)

Este es el método más rápido y sencillo. Azure creará automáticamente el registro de aplicación en Entra ID por ti.

### Paso 1: Acceder a la Configuración de Autenticación

1. Abre el [Azure Portal](https://portal.azure.com)
2. Busca "Container Apps" en la barra de búsqueda
3. Selecciona tu Container App (nombre: `ca-easyauth-demo`)
4. En el menú izquierdo, bajo **Security**, haz clic en **Authentication**

### Paso 2: Agregar el Proveedor de Identidad

1. Haz clic en **Add identity provider**
2. En la lista desplegable **Identity provider**, selecciona **Microsoft**
3. Verás que la opción **Create new app registration** está seleccionada por defecto

### Paso 3: Configurar el Registro de Aplicación

**App registration name**: 
- Deja el nombre generado automáticamente o cámbialo a algo descriptivo como `ContainerApp-EasyAuth-Demo`

**Supported account types**:
- **Current tenant - Single tenant** (solo usuarios de tu organización)
- O **Any Azure AD directory - Multitenant** (usuarios de cualquier organización con Azure AD)
- Para este POC, usa **Single tenant**

**Client secret expiration**:
- Selecciona una fecha de expiración (por ejemplo, **6 months** o **12 months**)
- ⚠️ **Importante**: Anota la fecha, deberás renovar el secret antes de que expire

### Paso 4: Configurar el Comportamiento de Autenticación

En la sección **Container App authentication settings**:

**Restrict access**:
- Selecciona **Require authentication**
- Esto redirigirá automáticamente usuarios no autenticados a la página de login

**Unauthenticated requests**:
- Deja el valor por defecto: **HTTP 302 Found redirect: recommended for websites**

**Token store**:
- ✅ Deja activado (enabled)
- Esto permite que Container Apps almacene y gestione tokens automáticamente

### Paso 5: (Opcional) Configurar Permisos

1. Haz clic en **Next: Permissions**
2. Aquí puedes agregar scopes adicionales si tu aplicación necesita acceder a Microsoft Graph u otros recursos
3. Para este POC básico, puedes omitir esta sección y hacer clic en **Add**

### Paso 6: Guardar y Verificar

1. Haz clic en **Add**
2. Espera unos segundos mientras Azure crea el registro de aplicación
3. Verás el proveedor **Microsoft** listado en la página de Authentication

### Paso 7: Probar la Autenticación

1. En la página **Overview** de tu Container App, copia la **Application Url**
2. Abre un navegador en **modo incógnito/privado**
3. Navega a la URL de tu Container App
4. Deberías ser redirigido automáticamente a la página de login de Microsoft
5. Ingresa con tu cuenta de Microsoft/Azure AD
6. Tras autenticarte, serás redirigido de vuelta a tu aplicación

✅ **¡Felicidades!** Tu Container App ahora requiere autenticación.

---

## Método 2: Configuración Manual (Recomendado para Producción)

Este método te da más control sobre el registro de aplicación y es útil cuando necesitas configuraciones avanzadas o usar un tenant diferente.

### Paso 1: Crear el Registro de Aplicación en Entra ID

#### 1.1 Obtener la URL del Container App

```bash
# Desde WSL/Bash
RESOURCE_GROUP="rg-container-app-easyauth"

APP_URL=$(az containerapp show \
  --name ca-easyauth-demo \
  --resource-group $RESOURCE_GROUP \
  --query properties.configuration.ingress.fqdn \
  --output tsv)

echo "URL de tu app: https://$APP_URL"
```

Anota esta URL, la necesitarás en el siguiente paso.

#### 1.2 Registrar la Aplicación

1. En Azure Portal, busca **Microsoft Entra ID** (o **Azure Active Directory**)
2. Haz clic en **App registrations** en el menú izquierdo
3. Haz clic en **+ New registration**

#### 1.3 Completar el Formulario de Registro

**Name**: 
```
ContainerApp-EasyAuth-Demo
```

**Supported account types**:
- Selecciona **Accounts in this organizational directory only (Single tenant)**

**Redirect URI**:
- Platform: **Web**
- URI: Reemplaza `<APP_URL>` con tu URL del paso 1.1
```
https://<APP_URL>/.auth/login/aad/callback
```

Ejemplo:
```
https://ca-easyauth-demo.happyforest-12345abc.eastus.azurecontainerapps.io/.auth/login/aad/callback
```

4. Haz clic en **Register**

#### 1.4 Anotar los Identificadores

Una vez creado el registro, en la página **Overview**:

1. Copia el **Application (client) ID**
   - Ejemplo: `12345678-1234-1234-1234-123456789abc`
   
2. Copia el **Directory (tenant) ID**
   - Ejemplo: `87654321-4321-4321-4321-abcdef123456`

**Guarda estos valores**, los necesitarás después.

### Paso 2: Configurar Tokens de ID

1. En el registro de aplicación, ve a **Authentication** en el menú izquierdo
2. En la sección **Implicit grant and hybrid flows**, marca:
   - ☑️ **ID tokens (used for implicit and hybrid flows)**
3. Haz clic en **Save**

### Paso 3: Exponer una API (Opcional pero Recomendado)

#### 3.1 Configurar el Application ID URI

1. En el menú izquierdo, haz clic en **Expose an API**
2. Haz clic en **Add** junto a **Application ID URI**
3. Acepta el valor por defecto (formato: `api://<CLIENT_ID>`) o usa uno personalizado:
   ```
   api://containerapp-easyauth-demo
   ```
4. Haz clic en **Save**

#### 3.2 Agregar un Scope

1. Haz clic en **+ Add a scope**
2. Completa los campos:

**Scope name**:
```
user_impersonation
```

**Who can consent?**:
- Selecciona **Admins and users**

**Admin consent display name**:
```
Access ContainerApp EasyAuth Demo
```

**Admin consent description**:
```
Allow the application to access ContainerApp EasyAuth Demo on behalf of the signed-in user.
```

**User consent display name**:
```
Access ContainerApp EasyAuth Demo
```

**User consent description**:
```
Allow the application to access ContainerApp EasyAuth Demo on your behalf.
```

**State**: **Enabled**

3. Haz clic en **Add scope**

### Paso 4: Crear un Client Secret

1. En el menú izquierdo, haz clic en **Certificates & secrets**
2. En la pestaña **Client secrets**, haz clic en **+ New client secret**
3. **Description**: `ContainerApp-EasyAuth-Secret`
4. **Expires**: Selecciona **6 months**, **12 months**, o **24 months**
5. Haz clic en **Add**
6. **⚠️ IMPORTANTE**: Copia el **Value** del secret AHORA
   - Este valor solo se muestra una vez
   - Ejemplo: `abC1dE2fG3hI4jK5lM6nO7pQ8rS9tU0vW1xY2zA3`

### Paso 5: Configurar Easy Auth en el Container App

#### 5.1 Via Azure Portal

1. Regresa a tu **Container App** en el Portal
2. Ve a **Security** → **Authentication**
3. Haz clic en **Add identity provider**
4. Selecciona **Microsoft**
5. En **App registration type**, selecciona:
   - **Provide the details of an existing app registration**

#### 5.2 Completar la Configuración

**Application (client) ID**:
- Pega el Client ID del Paso 1.4

**Client secret (recommended)**:
- Pega el secret del Paso 4

**Issuer URL**:
- Para Azure público (global):
  ```
  https://login.microsoftonline.com/<TENANT_ID>/v2.0
  ```
- Reemplaza `<TENANT_ID>` con tu Tenant ID del Paso 1.4
- Ejemplo completo:
  ```
  https://login.microsoftonline.com/87654321-4321-4321-4321-abcdef123456/v2.0
  ```

**Allowed token audiences** (opcional):
- Deja vacío o agrega tu Application ID URI:
  ```
  api://<CLIENT_ID>
  ```

#### 5.3 Configurar Opciones de Autenticación

**Restrict access**:
- Selecciona **Require authentication**

**Unauthenticated requests**:
- **HTTP 302 Found redirect: recommended for websites**

**Token store**: ☑️ Enabled

6. Haz clic en **Add**

### Paso 6: Verificar la Configuración

```bash
# Desde WSL/Bash
# Ver la configuración de autenticación
az containerapp auth show \
  --name ca-easyauth-demo \
  --resource-group $RESOURCE_GROUP
```

---

## 🔐 Configuración Avanzada

### Restringir Acceso a Usuarios Específicos

Por defecto, cualquier usuario en tu tenant puede autenticarse. Para restringir el acceso:

#### Opción 1: Via Portal

1. Ve al **App registration** en Entra ID
2. En el menú izquierdo, selecciona **Enterprise applications**
3. Busca y selecciona tu aplicación
4. Ve a **Properties**
5. Cambia **Assignment required?** a **Yes**
6. Haz clic en **Save**
7. Ve a **Users and groups**
8. Haz clic en **+ Add user/group**
9. Selecciona los usuarios o grupos que tendrán acceso
10. Haz clic en **Assign**

#### Opción 2: Via PowerShell

```powershell
# Requerir asignación de usuarios
$appId = "<APPLICATION_ID>"
$sp = Get-AzureADServicePrincipal -Filter "appId eq '$appId'"
Set-AzureADServicePrincipal -ObjectId $sp.ObjectId -AppRoleAssignmentRequired $true

# Asignar un usuario específico
$user = Get-AzureADUser -SearchString "user@domain.com"
New-AzureADUserAppRoleAssignment -ObjectId $user.ObjectId -PrincipalId $user.ObjectId -ResourceId $sp.ObjectId -Id ([Guid]::Empty)
```

### Configurar Roles Personalizados

1. En el **App registration**, ve a **App roles**
2. Haz clic en **+ Create app role**
3. Completa:
   - **Display name**: `Admin`
   - **Allowed member types**: `Users/Groups`
   - **Value**: `admin`
   - **Description**: `Administrator role`
   - **Enable this app role**: ☑️
4. Haz clic en **Apply**

Ahora puedes asignar roles a usuarios en **Enterprise applications** → **Users and groups**.

### Configurar Logout

El endpoint de logout está disponible en:
```
https://<APP_URL>/.auth/logout
```

Para redirigir después del logout:
```
https://<APP_URL>/.auth/logout?post_logout_redirect_uri=/
```

---

## 🧪 Probar la Autenticación

### Prueba Básica

```bash
# Hacer una request sin autenticación (debe redirigir a login)
curl -I https://<APP_URL>

# Deberías ver un HTTP 302 Found con Location apuntando a login.microsoftonline.com
```

### Obtener el Token de Autenticación

Una vez autenticado en el navegador, tu aplicación puede acceder a información del usuario a través de headers HTTP:

```csharp
// En tu aplicación .NET
public IActionResult GetUserInfo()
{
    // Obtener el principal del usuario
    var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
    var userEmail = User.FindFirst(ClaimTypes.Email)?.Value;
    var userName = User.FindFirst(ClaimTypes.Name)?.Value;
    
    // O acceder directamente a los headers
    var clientPrincipal = Request.Headers["X-MS-CLIENT-PRINCIPAL"];
    
    return Ok(new { userId, userEmail, userName });
}
```

### Acceder al Endpoint de Información del Usuario

Container Apps expone información del usuario autenticado en:

```bash
# Endpoint especial (requiere estar autenticado en el navegador)
curl https://<APP_URL>/.auth/me \
  -H "Cookie: <tu-cookie-de-sesion>"
```

---

## 📊 Monitoreo de Autenticación

### Consultas KQL para Application Insights

```kql
// Ver intentos de autenticación
requests
| where url contains "/.auth/"
| project timestamp, url, resultCode, client_IP
| order by timestamp desc

// Ver usuarios autenticados
requests
| where isnotempty(user_AuthenticatedId)
| summarize count() by user_AuthenticatedId, bin(timestamp, 1h)
| render timechart

// Ver errores de autenticación
requests
| where url contains "/.auth/" and resultCode >= 400
| project timestamp, url, resultCode, client_IP, operation_Name
| order by timestamp desc
```

### Logs del Container App

```bash
# Ver logs relacionados con autenticación
az containerapp logs show \
  --name ca-easyauth-demo \
  --resource-group $RESOURCE_GROUP \
  --follow \
  --tail 50 \
  | grep -i auth
```

---

## 🔧 Troubleshooting

### Problema: Redirect Loop Infinito

**Síntoma**: La aplicación redirige constantemente entre tu app y login.microsoftonline.com

**Solución**:
1. Verifica que el **Redirect URI** en el App Registration coincida exactamente con:
   ```
   https://<APP_URL>/.auth/login/aad/callback
   ```
2. Asegúrate de que `allowInsecure` esté en `false` en la configuración de ingress

### Problema: Error "AADSTS50011: The reply URL specified in the request does not match"

**Síntoma**: Error al intentar autenticarse

**Solución**:
1. Ve al App Registration en Entra ID
2. Verifica que la **Redirect URI** esté configurada correctamente
3. La URI debe ser exactamente: `https://<FQDN>/.auth/login/aad/callback`

### Problema: Client Secret Expirado

**Síntoma**: Los usuarios no pueden autenticarse después de cierto tiempo

**Solución**:
1. Ve al App Registration → **Certificates & secrets**
2. Crea un nuevo client secret
3. Actualiza el Container App con el nuevo secret:

```bash
# Via Azure CLI
az containerapp auth update \
  --name ca-easyauth-demo \
  --resource-group $RESOURCE_GROUP \
  --set identityProviders.azureActiveDirectory.registration.clientSecretSettingName=<new-secret>
```

O actualízalo via Portal en **Authentication** → **Microsoft** → **Edit**.

### Problema: "Access Denied" para Ciertos Usuarios

**Solución**:
1. Verifica que el usuario esté en el tenant correcto
2. Si configuraste **Assignment required**, asegúrate de que el usuario esté asignado a la aplicación
3. Revisa los **App roles** si estás usando autorización basada en roles

---

## 🎓 Siguiente Paso: Integrar con tu Aplicación

Una vez configurado Easy Auth, tu aplicación recibirá automáticamente información del usuario en los headers HTTP.

### Headers Disponibles

- `X-MS-CLIENT-PRINCIPAL`: JSON con información del usuario (Base64 encoded)
- `X-MS-CLIENT-PRINCIPAL-ID`: User ID
- `X-MS-CLIENT-PRINCIPAL-NAME`: Nombre/email del usuario
- `X-MS-CLIENT-PRINCIPAL-IDP`: Identity provider usado (aad, google, etc.)
- `X-MS-TOKEN-AAD-ID-TOKEN`: ID Token de Azure AD (si está disponible)
- `X-MS-TOKEN-AAD-ACCESS-TOKEN`: Access Token (si está disponible)

### Ejemplo de Uso en .NET

```csharp
public class UserInfoController : ControllerBase
{
    [HttpGet("api/userinfo")]
    public IActionResult GetUserInfo()
    {
        // Opción 1: Usar ClaimsPrincipal (más fácil)
        var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        var userEmail = User.FindFirst(ClaimTypes.Email)?.Value;
        var userName = User.FindFirst("name")?.Value;
        
        // Opción 2: Leer el header directamente
        if (Request.Headers.TryGetValue("X-MS-CLIENT-PRINCIPAL", out var principalHeader))
        {
            var decoded = Convert.FromBase64String(principalHeader);
            var json = Encoding.UTF8.GetString(decoded);
            var principal = JsonSerializer.Deserialize<ClientPrincipal>(json);
            
            return Ok(new 
            { 
                UserId = principal.userId,
                UserName = principal.userDetails,
                Claims = principal.claims
            });
        }
        
        return Ok(new { userId, userEmail, userName });
    }
}

public class ClientPrincipal
{
    public string identityProvider { get; set; }
    public string userId { get; set; }
    public string userDetails { get; set; }
    public IEnumerable<Claim> claims { get; set; }
}

public class Claim
{
    public string typ { get; set; }
    public string val { get; set; }
}
```

---

## 📚 Recursos Adicionales

- [Documentación oficial: Authentication in Container Apps](https://learn.microsoft.com/en-us/azure/container-apps/authentication)
- [Documentación oficial: Microsoft Entra ID provider](https://learn.microsoft.com/en-us/azure/container-apps/authentication-entra)
- [Customize sign-in and sign-out](https://learn.microsoft.com/en-us/azure/container-apps/authentication#customize-sign-in-and-sign-out)
- [Access user claims](https://learn.microsoft.com/en-us/azure/app-service/configure-authentication-user-identities)

## ✅ Checklist Final

- [ ] Container App desplegado y accesible
- [ ] App registration creado en Microsoft Entra ID
- [ ] Redirect URI configurado correctamente
- [ ] Client secret creado y configurado
- [ ] Authentication habilitado en Container App
- [ ] "Require authentication" activado
- [ ] Autenticación probada en navegador
- [ ] (Opcional) Usuarios/grupos asignados
- [ ] (Opcional) App roles configurados
- [ ] Fecha de expiración del secret anotada para renovación

¡Felicidades! 🎉 Tu Container App ahora está protegido con autenticación de Microsoft Entra ID.
