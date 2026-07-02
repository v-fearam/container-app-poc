# Container App POC - Easy Auth

Proyecto de prueba de concepto para implementar y probar Easy Authentication en Azure Container Apps.

## Objetivo

Explorar y validar la configuración de Easy Auth (Azure App Service Authentication/Authorization) en Azure Container Apps para proteger aplicaciones mediante autenticación integrada.

## Estado

🚧 En desarrollo inicial

## Tecnologías

- Azure Container Apps
- Azure Container Registry (ACR)
- Easy Auth (Azure App Service Authentication)
- .NET Sample App

## Arquitectura

La infraestructura incluye:
- **Container App Environment**: Entorno administrado para Container Apps
- **Container App**: Aplicación de ejemplo .NET (ASP.NET Core)
- **Azure Container Registry**: Registro privado para imágenes de contenedor
- **Log Analytics Workspace**: Para logging y monitoreo

## Despliegue

### Pre-requisitos

- Azure CLI instalado
- Suscripción de Azure activa
- WSL (Windows Subsystem for Linux) configurado

### Pasos de despliegue desde WSL

1. **Iniciar sesión en Azure**
   ```bash
   az login
   ```

2. **Configurar la suscripción (si tienes múltiples suscripciones)**
   ```bash
   az account set --subscription "TU_SUBSCRIPTION_ID"
   ```

3. **Crear un grupo de recursos**
   ```bash
   RESOURCE_GROUP="rg-container-app-easyauth"
   LOCATION="eastus"
   
   az group create \
     --name $RESOURCE_GROUP \
     --location $LOCATION
   ```

4. **Desplegar la infraestructura con Bicep**
   ```bash
   az deployment group create \
     --resource-group $RESOURCE_GROUP \
     --template-file biceps/main.bicep \
     --parameters location=$LOCATION
   ```

5. **Obtener la URL de la aplicación**
   ```bash
   az deployment group show \
     --resource-group $RESOURCE_GROUP \
     --name main \
     --query properties.outputs.containerAppUrl.value \
     --output tsv
   ```

### Verificar el despliegue

Una vez desplegado, puedes acceder a la aplicación a través de la URL generada. Deberías ver la aplicación de ejemplo de ASP.NET Core.

```bash
# Ver todos los outputs del despliegue
az deployment group show \
  --resource-group $RESOURCE_GROUP \
  --name main \
  --query properties.outputs
```

## Siguiente paso: Easy Auth con Entra ID

Documentación de referencia: [Authentication with Microsoft Entra ID](https://learn.microsoft.com/en-us/azure/container-apps/authentication-entra)

## Limpieza de recursos

Para eliminar todos los recursos creados:

```bash
az group delete --name $RESOURCE_GROUP --yes --no-wait
```

