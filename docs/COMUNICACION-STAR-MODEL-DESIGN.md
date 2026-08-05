# Diseño: Migración de Persona a Comunicación (Modelo Estrella)

> **Estado:** Pendiente de implementación  
> **Fecha:** 24 de Julio de 2026  
> **Objetivo:** Cambiar la POC de Change Feed para usar el modelo real de Comunicaciones de NDv2 con modelo estrella en SQL Server.

---

## 1. Contexto

La POC actual usa un modelo simplificado (Persona) para validar el Change Feed. Ahora queremos acercar la prueba a la realidad de NDv2, reemplazando `Persona` por `Comunicacion` con:

- **CosmosDB:** Documento de comunicación con eventos embebidos, TTL 45 días
- **SQL Server:** Modelo estrella desnormalizado (sin FKs) para consulta rápida
- **Change Feed:** Llama a un stored procedure transaccional que hace MERGE en todas las tablas

---

## 2. Modelo CosmosDB — Documento de Comunicación

Reemplaza `PersonaDto` y la collection `personas` por `comunicaciones`.

```json
{
  "id": "com-uuid-123",
  "tipoProceso": "recupero-clave",
  "canal": "email",
  "contacto": "usuario@mail.com",
  "parametros": { "nombre": "Juan", "token": "abc123", "url": "https://..." },
  "template": "recupero-clave-v2",
  "estado": "delivered",
  "fechaCreacion": "2026-06-30T14:00:00Z",
  "fechaUltimaModif": "2026-06-30T14:02:30Z",
  "envio": {
    "proveedorId": "msg-mailgun-xyz",
    "fechaEnvio": "2026-06-30T14:00:03Z",
    "respuesta": "queued"
  },
  "eventos": [
    { "tipo": "accepted", "fecha": "2026-06-30T14:00:03Z" },
    { "tipo": "delivered", "fecha": "2026-06-30T14:02:30Z" },
    { "tipo": "opened", "fecha": "2026-06-30T15:10:00Z" }
  ],
  "ttl": 3888000
}
```

**Notas:**
- `id` es partition key (point reads por comunicacionId)
- `estado` es el último evento conocido (precalculado)
- `fechaUltimaModif` se setea manualmente en cada create/update (lección Cosmos SDK)
- `eventos` es un array embebido: el documento es autocontenido, sin JOINs. **No hay eventos duplicados por tipo** — si un evento del mismo tipo se agrega de nuevo, se reemplaza (se queda con el último)
- `envio` es informativo para la POC — se guarda dentro de `parametros` (JSON libre). En producción podría tener columnas propias en la Fact
- `parametros` es informativo (JSON libre), no se consulta en Cosmos. Incluye `envio` para la POC
- `ttl` de 45 días (3888000 segundos)

**Deletes y TTL:** Change Feed en modo "latest version" (el que usamos) **no envía** eventos de delete ni TTL expiration. Solo inserts y updates. Los documentos expirados en Cosmos desaparecen silenciosamente. La limpieza en SQL se hace con el SP de depuración por partición (sección 3.3).

---

## 3. Modelo SQL Server — Estrella Desnormalizado

### 3.1 Diagrama

```
                    ┌─────────────────────────┐
                    │   FactEventosGenericas   │
                    │─────────────────────────│
                    │ id (bigint, PK, IDENTITY)│
                    │ idFactComunicacion       │
                    │ idFecha                  │
                    │ idEstadio                │
                    │ dia_creacion             │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │ FactComunicacionesGen   │
                    │─────────────────────────│
                    │ id (bigint, PK, IDENTITY)│
                    │ cosmosId (nvarchar 100)  │
                    │ fecha_creacion           │
                    │ idEstadio                │
                    │ idTipo                   │
                    │ idFecha                  │
                    │ idCanal                  │
                    │ nroComprobante           │
                    │ idContacto               │
                    │ fechaUltimaModif         │
                    │ parametros (nvarchar max) │
                    │ dia_creacion             │
                    └────┬───┬───┬───┬───┬────┘
                         │   │   │   │   │
           ┌─────────────┘   │   │   │   └─────────────┐
           ▼                 ▼   ▼   ▼                 ▼
      ┌─────────┐    ┌────────┐ ┌──────┐ ┌───────────┐ ┌──────────┐
      │DimTipos │    │DimFecha│ │DimCan│ │DimContacto│ │DimEstadio│
      │─────────│    │────────│ │──────│ │───────────│ │──────────│
      │id (PK)  │    │id (PK) │ │id(PK)│ │id (PK)    │ │id (PK)   │
      │Nombre   │    │Date    │ │Nombre│ │contacto   │ │Nombre    │
      └─────────┘    │dia     │ └──────┘ │tipo       │ └──────────┘
                     │mes     │          └───────────┘
                     │anio    │
                     │trimestr│
                     └────────┘
```

### 3.2 Decisiones de diseño

| Decisión | Detalle |
|----------|---------|
| **Sin FKs** | Desnormalizado para performance de inserciones masivas. Sin constraints de integridad referencial. |
| **IDENTITY en Facts** | `id` autoincremental en SQL, `cosmosId` guarda el ID de Cosmos para idempotencia |
| **Dimensiones por demanda** | Si el contacto/tipo/canal no existe, el stored procedure lo crea con MERGE |
| **Sin DimServicios** | La POC no tiene datos de suministro/empresa. Se agrega en producción. |
| **Particionado por día** | Facts particionadas por `dia_creacion` (día del año 1-366). Retención 4 días para probar depuración rápidamente. |

### 3.3 Particionado por Día — Cómo funciona

#### ¿Por qué por día en la POC?

En producción la partición será por **año** (retención 4 años). Pero la POC quiere validar:
- Cómo crear particiones
- Cómo las queries usan partition elimination
- Cómo depurar (borrar datos viejos) haciendo `TRUNCATE ... WITH (PARTITIONS(n))`
- El ciclo de mantenimiento de particiones

Usamos **día** porque genera particiones visibles en horas (no hay que esperar semanas ni meses). Retención de 4 días permite probar depuración al día siguiente.

#### Partition Function y Scheme

```sql
-- ============================================================
-- Partition Function: por día del año (1-366)
-- RANGE RIGHT: boundary es el primer valor de la partición
-- Ejemplo: boundary 205 → partición contiene día 205 (24 de julio)
-- ============================================================

-- Creamos boundaries para todos los días posibles del año
-- Esto crea 366 particiones (una por día) + 1 overflow
CREATE PARTITION FUNCTION pf_Diaria (INT)
AS RANGE RIGHT FOR VALUES (
    1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,
    21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,
    41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,
    61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,
    81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,
    101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,
    121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,
    141,142,143,144,145,146,147,148,149,150,151,152,153,154,155,156,157,158,159,160,
    161,162,163,164,165,166,167,168,169,170,171,172,173,174,175,176,177,178,179,180,
    181,182,183,184,185,186,187,188,189,190,191,192,193,194,195,196,197,198,199,200,
    201,202,203,204,205,206,207,208,209,210,211,212,213,214,215,216,217,218,219,220,
    221,222,223,224,225,226,227,228,229,230,231,232,233,234,235,236,237,238,239,240,
    241,242,243,244,245,246,247,248,249,250,251,252,253,254,255,256,257,258,259,260,
    261,262,263,264,265,266,267,268,269,270,271,272,273,274,275,276,277,278,279,280,
    281,282,283,284,285,286,287,288,289,290,291,292,293,294,295,296,297,298,299,300,
    301,302,303,304,305,306,307,308,309,310,311,312,313,314,315,316,317,318,319,320,
    321,322,323,324,325,326,327,328,329,330,331,332,333,334,335,336,337,338,339,340,
    341,342,343,344,345,346,347,348,349,350,351,352,353,354,355,356,357,358,359,360,
    361,362,363,364,365,366
);

-- Azure SQL Database: solo filegroup PRIMARY (no soporta múltiples)
CREATE PARTITION SCHEME ps_Diaria
AS PARTITION pf_Diaria
ALL TO ([PRIMARY]);
```

#### Columna de partición

Cada tabla Fact tiene la columna `dia_creacion` (INT) que se calcula como:
```sql
-- Día del año (1-366)
DATEPART(DAYOFYEAR, @fechaCreacion)
```

> **Nota:** En producción se usaría `anio_creacion` (INT) con boundaries `2024, 2025, 2026, 2027, 2028`. El patrón es idéntico — solo cambian los boundaries y la granularidad.

#### Depuración: SWITCH + TRUNCATE (eliminar particiones viejas)

El patrón para borrar datos de una partición sin afectar a las demás:

```sql
-- ============================================================
-- Depuración: Eliminar datos de días > 4 días atrás
-- Patrón: TRUNCATE ... WITH (PARTITIONS(n)) — instantáneo
-- ============================================================

-- 1. Calcular qué día borrar (hace 5 días)
DECLARE @diaABorrar INT = DATEPART(DAYOFYEAR, DATEADD(DAY, -5, GETUTCDATE()));

-- 2. Obtener número de partición para ese día
DECLARE @partitionNumber INT = $PARTITION.pf_Diaria(@diaABorrar);

-- 3. TRUNCATE directamente (SQL Server 2016+ / Azure SQL)
TRUNCATE TABLE FactComunicacionesGenericas
WITH (PARTITIONS (@partitionNumber));

TRUNCATE TABLE FactEventosGenericas
WITH (PARTITIONS (@partitionNumber));
```

> **Alternativa: SWITCH PARTITION** — para escenarios que necesitan archivar antes de borrar (staging table → backup → DROP). Para la POC, TRUNCATE directo es más simple.

**Ventajas de TRUNCATE PARTITION vs DELETE:**
| | DELETE WHERE dia = X | TRUNCATE PARTITION |
|---|---|---|
| **Velocidad** | Minutos-horas (row by row, genera log) | Instantáneo (metadata operation) |
| **Transaction log** | Crece enormemente | Sin growth |
| **Bloqueos** | Bloquea la tabla durante el DELETE | Sin bloqueos en la tabla original |

#### Stored Procedure de Depuración

```sql
CREATE OR ALTER PROCEDURE usp_DepurarDiasViejos
    @diasARetener INT = 4  -- retener últimos N días
AS
BEGIN
    SET NOCOUNT ON;
    
    DECLARE @diaActual INT = DATEPART(DAYOFYEAR, GETUTCDATE());
    DECLARE @diaLimite INT = @diaActual - @diasARetener;
    
    -- Si cruza el año (ej: día actual = 3, retener 4 → limite = -1 → buscar días 361-366 del año anterior)
    -- Para la POC simplificamos: solo borrar si limite > 0
    IF @diaLimite <= 0
    BEGIN
        PRINT 'Nada que depurar (cruce de año, POC no lo maneja)';
        RETURN;
    END
    
    DECLARE @dia INT = 1;
    
    WHILE @dia < @diaLimite
    BEGIN
        -- Solo si la partición tiene datos
        IF EXISTS (
            SELECT 1 FROM sys.partitions p
            INNER JOIN sys.tables t ON p.object_id = t.object_id
            WHERE t.name = 'FactComunicacionesGenericas'
              AND p.index_id <= 1
              AND p.partition_number = $PARTITION.pf_Diaria(@dia)
              AND p.rows > 0
        )
        BEGIN
            PRINT CONCAT('Depurando día ', @dia, '...');
            
            -- TRUNCATE partición de ambas Facts (instantáneo)
            TRUNCATE TABLE FactComunicacionesGenericas
            WITH (PARTITIONS ($PARTITION.pf_Diaria(@dia)));
            
            TRUNCATE TABLE FactEventosGenericas
            WITH (PARTITIONS ($PARTITION.pf_Diaria(@dia)));
            
            PRINT CONCAT('Día ', @dia, ' depurado OK');
        END
        
        SET @dia = @dia + 1;
    END
    
    -- Limpiar DimFechas que ya no están referenciadas por ningún Fact
    DELETE FROM DimFechas
    WHERE NOT EXISTS (
        SELECT 1 FROM FactComunicacionesGenericas f WHERE f.idFecha = DimFechas.id
    )
    AND NOT EXISTS (
        SELECT 1 FROM FactEventosGenericas fe WHERE fe.idFecha = DimFechas.id
    );
    
    PRINT CONCAT('DimFechas: eliminadas ', @@ROWCOUNT, ' fechas huérfanas');
END
GO
```

> **Nota para producción:** Con 4 años de datos y millones de filas en Facts, el `NOT EXISTS` para limpiar DimFechas sería lento (escanea las Facts). En producción, como se purga un año entero, usar directamente `DELETE FROM DimFechas WHERE anio <= YEAR(GETUTCDATE()) - 4` — sin verificar referencias, porque sabemos que las Facts de ese año ya fueron eliminadas. DimFechas no necesita partición (~1460 filas máximo).

> **Nota:** En SQL Server 2016+ y Azure SQL Database, `TRUNCATE TABLE ... WITH (PARTITIONS(n))` es soportado directamente. No se necesita staging table. Esto es más simple que SWITCH para nuestro caso.

### 3.4 DDL — Tablas (con particionado)

```sql
-- ============================================================
-- Partition infrastructure
-- ============================================================

CREATE PARTITION FUNCTION pf_Diaria (INT)
AS RANGE RIGHT FOR VALUES (
    1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,
    21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,
    41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,
    61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,
    81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,
    101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,
    121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,
    141,142,143,144,145,146,147,148,149,150,151,152,153,154,155,156,157,158,159,160,
    161,162,163,164,165,166,167,168,169,170,171,172,173,174,175,176,177,178,179,180,
    181,182,183,184,185,186,187,188,189,190,191,192,193,194,195,196,197,198,199,200,
    201,202,203,204,205,206,207,208,209,210,211,212,213,214,215,216,217,218,219,220,
    221,222,223,224,225,226,227,228,229,230,231,232,233,234,235,236,237,238,239,240,
    241,242,243,244,245,246,247,248,249,250,251,252,253,254,255,256,257,258,259,260,
    261,262,263,264,265,266,267,268,269,270,271,272,273,274,275,276,277,278,279,280,
    281,282,283,284,285,286,287,288,289,290,291,292,293,294,295,296,297,298,299,300,
    301,302,303,304,305,306,307,308,309,310,311,312,313,314,315,316,317,318,319,320,
    321,322,323,324,325,326,327,328,329,330,331,332,333,334,335,336,337,338,339,340,
    341,342,343,344,345,346,347,348,349,350,351,352,353,354,355,356,357,358,359,360,
    361,362,363,364,365,366
);

CREATE PARTITION SCHEME ps_Diaria
AS PARTITION pf_Diaria
ALL TO ([PRIMARY]);

-- ============================================================
-- Dimensiones (no particionadas — son pequeñas)
-- ============================================================

CREATE TABLE DimTipos (
    id       INT IDENTITY(1,1) PRIMARY KEY,
    Nombre   NVARCHAR(200) NOT NULL UNIQUE
);

CREATE TABLE DimFechas (
    id        INT IDENTITY(1,1) PRIMARY KEY,
    [Date]    DATE NOT NULL UNIQUE,
    dia       INT NOT NULL,
    mes       INT NOT NULL,
    anio      INT NOT NULL,
    trimestre INT NOT NULL,
    semana    INT NOT NULL  -- ISO week (para referencia, no para partición)
);

CREATE TABLE DimCanales (
    id       INT IDENTITY(1,1) PRIMARY KEY,
    Nombre   NVARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE DimContactos (
    id       INT IDENTITY(1,1) PRIMARY KEY,
    contacto NVARCHAR(500) NOT NULL,
    tipo     NVARCHAR(100) NOT NULL,
    CONSTRAINT UQ_DimContactos UNIQUE (contacto, tipo)
);

CREATE TABLE DimEstadio (
    id       INT IDENTITY(1,1) PRIMARY KEY,
    Nombre   NVARCHAR(200) NOT NULL UNIQUE
);

-- ============================================================
-- Facts (PARTICIONADAS por dia_creacion)
-- ============================================================

CREATE TABLE FactComunicacionesGenericas (
    id                BIGINT IDENTITY(1,1) NOT NULL,
    cosmosId          NVARCHAR(100) NOT NULL,
    fecha_creacion    DATETIME2 NOT NULL,
    idEstadio         INT NOT NULL,
    idTipo            INT NOT NULL,
    idFecha           INT NOT NULL,
    idCanal           INT NOT NULL,
    nroComprobante    NVARCHAR(200) NULL,
    idContacto        INT NOT NULL,
    fechaUltimaModif  DATETIME2 NOT NULL,
    parametros        NVARCHAR(MAX) NULL,
    dia_creacion      INT NOT NULL,
    -- PK debe incluir la columna de partición
    CONSTRAINT PK_FactComunicaciones PRIMARY KEY (id, dia_creacion)
) ON ps_Diaria(dia_creacion);

CREATE TABLE FactEventosGenericas (
    id                  BIGINT IDENTITY(1,1) NOT NULL,
    idFactComunicacion  BIGINT NOT NULL,
    idFecha             INT NOT NULL,
    idEstadio           INT NOT NULL,
    dia_creacion        INT NOT NULL,
    CONSTRAINT PK_FactEventos PRIMARY KEY (id, dia_creacion)
) ON ps_Diaria(dia_creacion);

-- ============================================================
-- Índices (recomendados por doc de arquitectura)
-- ============================================================

-- Idempotencia: lookup por cosmosId (unique dentro de cada partición)
CREATE UNIQUE NONCLUSTERED INDEX IX_FactComm_CosmosId 
ON FactComunicacionesGenericas(cosmosId, dia_creacion)
ON ps_Diaria(dia_creacion);

-- Query principal OV/PAC: comunicaciones por contacto + fecha
-- (En POC no tenemos DimServicios, usamos idContacto como filtro principal)
CREATE NONCLUSTERED INDEX IX_FactComm_Contacto_Fecha
ON FactComunicacionesGenericas(idContacto, idFecha)
INCLUDE (idTipo, idCanal, idEstadio, nroComprobante)
ON ps_Diaria(dia_creacion);

-- Eventos por comunicación
CREATE NONCLUSTERED INDEX IX_FactEventos_Comunicacion
ON FactEventosGenericas(idFactComunicacion)
INCLUDE (idFecha, idEstadio)
ON ps_Diaria(dia_creacion);

-- Fecha: para range queries temporales
CREATE NONCLUSTERED INDEX IX_FactComm_Fecha
ON FactComunicacionesGenericas(idFecha, dia_creacion)
ON ps_Diaria(dia_creacion);
```

### 3.5 Verificar particionado

```sql
-- Ver cuántas filas hay en cada partición
SELECT 
    p.partition_number,
    p.rows,
    prv.value AS boundary_value
FROM sys.partitions p
INNER JOIN sys.tables t ON p.object_id = t.object_id
LEFT JOIN sys.partition_range_values prv 
    ON prv.function_id = (
        SELECT ps.function_id 
        FROM sys.partition_schemes ps 
        INNER JOIN sys.indexes i ON ps.data_space_id = i.data_space_id
        WHERE i.object_id = t.object_id AND i.index_id <= 1
    )
    AND prv.boundary_id = p.partition_number - 1
WHERE t.name = 'FactComunicacionesGenericas'
  AND p.index_id <= 1  -- heap or clustered
  AND p.rows > 0
ORDER BY p.partition_number;

-- Verificar partition elimination en un query
SET STATISTICS IO ON;
SELECT * FROM FactComunicacionesGenericas 
WHERE dia_creacion = DATEPART(DAYOFYEAR, GETUTCDATE());
-- Debería mostrar "Scan count 1" (solo una partición escaneada)
```

---

## 4. Stored Procedure — Transaccional con MERGE

El Change Feed llama a **un solo stored procedure** que:
1. Hace MERGE en cada dimensión (inserta si no existe, devuelve ID)
2. Hace MERGE en FactComunicaciones (inserta o actualiza por `cosmosId`)
3. Hace MERGE en FactEventos (inserta eventos nuevos)
4. Todo en una transacción implícita (el SP es atómico)

```sql
CREATE OR ALTER PROCEDURE usp_UpsertComunicacionGenerica
    -- Comunicación
    @cosmosId           NVARCHAR(100),
    @fechaCreacion      DATETIME2,
    @fechaUltimaModif   DATETIME2,
    @estado             NVARCHAR(200),
    @tipoProceso        NVARCHAR(200),
    @canal              NVARCHAR(100),
    @contacto           NVARCHAR(500),
    @tipoContacto       NVARCHAR(100),  -- 'email' o 'sms'
    @nroComprobante     NVARCHAR(200) = NULL,
    @parametros         NVARCHAR(MAX) = NULL,
    -- Eventos (JSON array)
    @eventosJson        NVARCHAR(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    -- ================================================================
    -- 1. Ensure dimensions exist (INSERT TRY/CATCH — deadlock-free)
    -- Pattern: attempt INSERT, ignore unique violation (2601/2627),
    -- then SELECT id. No range locks = no deadlock under concurrency.
    -- ================================================================
    
    -- DimTipos
    DECLARE @idTipo INT;
    BEGIN TRY
        INSERT INTO DimTipos (Nombre) VALUES (@tipoProceso);
    END TRY
    BEGIN CATCH
        IF ERROR_NUMBER() NOT IN (2601, 2627) THROW;
    END CATCH
    SET @idTipo = (SELECT id FROM DimTipos WHERE Nombre = @tipoProceso);
    
    -- DimCanales
    DECLARE @idCanal INT;
    BEGIN TRY
        INSERT INTO DimCanales (Nombre) VALUES (@canal);
    END TRY
    BEGIN CATCH
        IF ERROR_NUMBER() NOT IN (2601, 2627) THROW;
    END CATCH
    SET @idCanal = (SELECT id FROM DimCanales WHERE Nombre = @canal);
    
    -- DimContactos
    DECLARE @idContacto INT;
    BEGIN TRY
        INSERT INTO DimContactos (contacto, tipo) VALUES (@contacto, @tipoContacto);
    END TRY
    BEGIN CATCH
        IF ERROR_NUMBER() NOT IN (2601, 2627) THROW;
    END CATCH
    SET @idContacto = (SELECT id FROM DimContactos 
                       WHERE contacto = @contacto AND tipo = @tipoContacto);
    
    -- DimEstadio (estado actual)
    DECLARE @idEstadio INT;
    BEGIN TRY
        INSERT INTO DimEstadio (Nombre) VALUES (@estado);
    END TRY
    BEGIN CATCH
        IF ERROR_NUMBER() NOT IN (2601, 2627) THROW;
    END CATCH
    SET @idEstadio = (SELECT id FROM DimEstadio WHERE Nombre = @estado);
    
    -- DimFechas (por fecha de creación)
    DECLARE @fechaDate DATE = CAST(@fechaCreacion AS DATE);
    DECLARE @idFecha INT;
    BEGIN TRY
        INSERT INTO DimFechas ([Date], dia, mes, anio, trimestre, semana)
        VALUES (@fechaDate, 
                DAY(@fechaDate), 
                MONTH(@fechaDate), 
                YEAR(@fechaDate),
                DATEPART(QUARTER, @fechaDate),
                DATEPART(ISO_WEEK, @fechaDate));
    END TRY
    BEGIN CATCH
        IF ERROR_NUMBER() NOT IN (2601, 2627) THROW;
    END CATCH
    SET @idFecha = (SELECT id FROM DimFechas WHERE [Date] = @fechaDate);
    
    -- ================================================================
    -- 2. MERGE FactComunicacionesGenericas
    -- ================================================================
    
    DECLARE @diaCreacion INT = DATEPART(DAYOFYEAR, @fechaCreacion);
    DECLARE @idFactComunicacion BIGINT;
    
    MERGE FactComunicacionesGenericas AS target
    USING (SELECT @cosmosId AS cosmosId, @diaCreacion AS dia_creacion) AS source
    ON target.cosmosId = source.cosmosId AND target.dia_creacion = source.dia_creacion
    WHEN MATCHED AND @fechaUltimaModif >= target.fechaUltimaModif THEN
        UPDATE SET
            idEstadio = @idEstadio,
            idTipo = @idTipo,
            idCanal = @idCanal,
            idContacto = @idContacto,
            fechaUltimaModif = @fechaUltimaModif,
            parametros = @parametros
    WHEN NOT MATCHED THEN
        INSERT (cosmosId, fecha_creacion, idEstadio, idTipo, idFecha, 
                idCanal, nroComprobante, idContacto, fechaUltimaModif, 
                parametros, dia_creacion)
        VALUES (@cosmosId, @fechaCreacion, @idEstadio, @idTipo, @idFecha,
                @idCanal, @nroComprobante, @idContacto, @fechaUltimaModif,
                @parametros, @diaCreacion);
    
    SET @idFactComunicacion = (SELECT id FROM FactComunicacionesGenericas 
                               WHERE cosmosId = @cosmosId AND dia_creacion = @diaCreacion);
    
    -- Guard: si el MERGE no produjo resultado, algo falló
    IF @idFactComunicacion IS NULL
    BEGIN
        RAISERROR('MERGE de FactComunicaciones no produjo resultado para cosmosId=%s', 16, 1, @cosmosId);
        RETURN;
    END
    
    -- ================================================================
    -- 3. INSERT FactEventosGenericas (de JSON array)
    -- ================================================================
    
    IF @eventosJson IS NOT NULL AND LEN(@eventosJson) > 2
    BEGIN
        -- Asegurar dimensiones de eventos existan primero
        INSERT INTO DimEstadio (Nombre)
        SELECT DISTINCT e.tipo 
        FROM OPENJSON(@eventosJson) WITH (tipo NVARCHAR(200) '$.tipo') e
        WHERE NOT EXISTS (SELECT 1 FROM DimEstadio WHERE Nombre = e.tipo);
        
        INSERT INTO DimFechas ([Date], dia, mes, anio, trimestre, semana)
        SELECT DISTINCT 
            CAST(e.fecha AS DATE),
            DAY(CAST(e.fecha AS DATE)),
            MONTH(CAST(e.fecha AS DATE)),
            YEAR(CAST(e.fecha AS DATE)),
            DATEPART(QUARTER, CAST(e.fecha AS DATE)),
            DATEPART(ISO_WEEK, CAST(e.fecha AS DATE))
        FROM OPENJSON(@eventosJson) WITH (fecha DATETIME2 '$.fecha') e
        WHERE NOT EXISTS (SELECT 1 FROM DimFechas WHERE [Date] = CAST(e.fecha AS DATE));
        
        -- Upsert eventos: si ya existe un evento del mismo tipo para esta comunicación,
        -- se actualiza (queda el último). No se permiten duplicados por tipo.
        MERGE FactEventosGenericas AS target
        USING (
            SELECT 
                @idFactComunicacion AS idFactComunicacion,
                df.id AS idFecha,
                de.id AS idEstadio,
                @diaCreacion AS dia_creacion
            FROM OPENJSON(@eventosJson)
            WITH (
                tipo NVARCHAR(200) '$.tipo',
                fecha DATETIME2 '$.fecha'
            ) e
            INNER JOIN DimEstadio de ON de.Nombre = e.tipo
            INNER JOIN DimFechas df ON df.[Date] = CAST(e.fecha AS DATE)
        ) AS source
        ON target.idFactComunicacion = source.idFactComunicacion
           AND target.idEstadio = source.idEstadio
           AND target.dia_creacion = source.dia_creacion
        WHEN MATCHED THEN
            UPDATE SET idFecha = source.idFecha
        WHEN NOT MATCHED THEN
            INSERT (idFactComunicacion, idFecha, idEstadio, dia_creacion)
            VALUES (source.idFactComunicacion, source.idFecha, source.idEstadio, source.dia_creacion);
    END
END
GO
```

---

## 5. Flujo Change Feed → Stored Procedure

### Actual (EF Core — tabla plana)
```
Change Feed → ChangeFeedHandler → EF Core FirstOrDefault + Insert/Update → PersonasSync
```

### Nuevo (Stored Procedure — modelo estrella)
```
Change Feed → ChangeFeedHandler → ADO.NET SqlCommand "EXEC usp_UpsertComunicacionGenerica" → 5 tablas
```

### Cambios en ChangeFeedHandler

```csharp
// ANTES: EF Core con tabla plana
private async Task UpsertPersonaToSql(Persona persona, CancellationToken ct)
{
    await using var dbContext = await dbContextFactory.CreateDbContextAsync(ct);
    var existing = await dbContext.PersonasSync.FirstOrDefaultAsync(p => p.Id == persona.Id, ct);
    // ... insert or update ...
}

// DESPUÉS: Stored Procedure con modelo estrella
private async Task UpsertComunicacionToSql(Comunicacion comunicacion, CancellationToken ct)
{
    await using var dbContext = await dbContextFactory.CreateDbContextAsync(ct);
    var connection = dbContext.Database.GetDbConnection();
    await connection.OpenAsync(ct);

    using var command = connection.CreateCommand();
    command.CommandText = "usp_UpsertComunicacionGenerica";
    command.CommandType = CommandType.StoredProcedure;

    command.Parameters.Add(new SqlParameter("@cosmosId", comunicacion.Id));
    command.Parameters.Add(new SqlParameter("@fechaCreacion", comunicacion.FechaCreacion));
    command.Parameters.Add(new SqlParameter("@fechaUltimaModif", comunicacion.FechaUltimaModif));
    command.Parameters.Add(new SqlParameter("@estado", comunicacion.Estado));
    command.Parameters.Add(new SqlParameter("@tipoProceso", comunicacion.TipoProceso));
    command.Parameters.Add(new SqlParameter("@canal", comunicacion.Canal));
    command.Parameters.Add(new SqlParameter("@contacto", comunicacion.Contacto));
    command.Parameters.Add(new SqlParameter("@tipoContacto", comunicacion.Canal));  // email/sms
    command.Parameters.Add(new SqlParameter("@parametros", 
        comunicacion.Parametros != null ? JsonSerializer.Serialize(comunicacion.Parametros) : DBNull.Value));
    command.Parameters.Add(new SqlParameter("@eventosJson",
        comunicacion.Eventos?.Count > 0 ? JsonSerializer.Serialize(comunicacion.Eventos) : DBNull.Value));

    await command.ExecuteNonQueryAsync(ct);
}
```

**Ventajas del SP:**
- **Una sola llamada a SQL** (no N queries de EF Core)
- **Transaccional** (si falla algo, nada se commitea)
- **MERGE** inserta o actualiza según exista (idempotente)
- **Dimensiones por demanda** (no requiere pre-carga)
- **Idempotencia** (`fechaUltimaModif >= target.fechaUltimaModif` en el MERGE)

---

## 6. Archivos a cambiar

### Bicep / Infraestructura

| Archivo | Línea | Cambio |
|---|---|---|
| `biceps/main.bicep` | ~103 | `cosmosCollection = 'personas'` → `'comunicaciones'` |
| `biceps/main.bicep` | ~106 | `processorName = 'cfp-personas'` → `'cfp-comunicaciones'` |
| `biceps/main.bicep` | ~109 | `verticalName = 'personas'` → `'comunicaciones'` |
| `biceps/modules/cosmos-db.bicep` | ~67 | Container resource `'personas'` → `'comunicaciones'` |
| `biceps/modules/changefeed-worker-container-app.bicep` | ~31,34,37 | Defaults `'personas'` → `'comunicaciones'` (3 params) |

### Backend (WeatherApi)

| Archivo actual | Acción | Nuevo nombre |
|---|---|---|
| `Models/PersonaModels.cs` | **Reemplazar** | `Models/ComunicacionModels.cs` |
| `Controllers/CosmosPersonasController.cs` | **Reemplazar** | `Controllers/CosmosComunicacionesController.cs` |
| `Controllers/SyncController.cs` | **Reescribir** | Queries al modelo estrella via SQL View (ver abajo) |
| `Models/SyncModels.cs` | **Reescribir** | DTOs para modelo estrella |
| `Data/Entities/PersonaSync.cs` | **Eliminar** | No se usa más (SP directo) |
| `Data/Configurations/PersonaSyncConfiguration.cs` | **Eliminar** | No se usa más |
| `Data/DashboardDbContext.cs` | **Modificar** | Quitar `PersonasSync` DbSet |

#### SyncController — Cómo query el modelo estrella

El star model con JOINs cruzados es incómodo de modelar con EF Core entities. Usar **SQL View + raw query**:

```sql
-- Crear View en SQL Server (DDL junto con tablas)
CREATE VIEW vw_ComunicacionesConDims AS
SELECT 
    f.id, f.cosmosId, f.fecha_creacion, f.fechaUltimaModif, f.parametros,
    f.dia_creacion,
    dt.Nombre AS tipoProceso,
    dc.Nombre AS canal,
    dco.contacto, dco.tipo AS tipoContacto,
    de.Nombre AS estado,
    df.[Date] AS fechaDate,
    (SELECT COUNT(*) FROM FactEventosGenericas fe 
     WHERE fe.idFactComunicacion = f.id AND fe.dia_creacion = f.dia_creacion) AS cantEventos
FROM FactComunicacionesGenericas f
INNER JOIN DimTipos dt ON f.idTipo = dt.id
INNER JOIN DimCanales dc ON f.idCanal = dc.id
INNER JOIN DimContactos dco ON f.idContacto = dco.id
INNER JOIN DimEstadio de ON f.idEstadio = de.id
INNER JOIN DimFechas df ON f.idFecha = df.id;
```

```csharp
// SyncController — query con raw SQL sobre la View
// ⚠️ IMPORTANTE: Los alias de la View DEBEN matchear exactamente los property names del DTO.
// SqlQueryRaw mapea por nombre de columna (case-insensitive). Si no matchea, queda NULL sin error.
var comunicaciones = await dbContext.Database
    .SqlQueryRaw<ComunicacionSyncDto>("SELECT TOP(@limit) * FROM vw_ComunicacionesConDims ORDER BY fechaUltimaModif DESC",
        new SqlParameter("@limit", limit))
    .ToListAsync();
```

#### Backend — Nuevo endpoint para agregar eventos

```csharp
// POST /api/cosmos/comunicaciones/{id}/eventos
// Agrega un evento al array de eventos de una comunicación existente
// Actualiza también el campo "estado" con el último evento
[HttpPost("{id}/eventos")]
public async Task<IActionResult> AgregarEvento(string id, [FromBody] AgregarEventoRequest request)
{
    // 1. ReadItem (point-read por id)
    // 2. Add evento al array comunicacion.Eventos
    // 3. Actualizar estado = request.Tipo (último evento)
    // 4. FechaUltimaModif = DateTime.UtcNow (CRITICAL: Change Feed lo necesita)
    // 5. ReplaceItem → dispara Change Feed → SP actualiza modelo estrella
}
```

### ChangeFeedWorker

| Archivo actual | Acción | Nuevo nombre |
|---|---|---|
| `Models/Persona.cs` | **Reemplazar** | `Models/Comunicacion.cs` |
| `Services/ChangeFeedWorkerService.cs` | **Modificar** | `GetChangeFeedProcessorBuilder<Persona>` → `<Comunicacion>` (línea 38) |
| `Services/IChangeFeedHandler.cs` | **Modificar** | `ProcessBatchAsync(IReadOnlyCollection<Comunicacion>)` |
| `Services/ChangeFeedHandler.cs` | **Reescribir** | UpsertComunicacionToSql con SP call (ADO.NET) |
| `Data/Entities/PersonaSync.cs` | **Eliminar** | No se usa más |
| `Data/DashboardDbContext.cs` | **Modificar** | Quitar `PersonasSync` DbSet |
| `appsettings.json` | **Modificar** | Ver sección 7 |

> ⚠️ **Serialización:** El worker usa el CosmosClient **sin** custom serializer → usa **Newtonsoft.Json** por default. El nuevo `Comunicacion.cs` del worker DEBE usar `[JsonProperty("id")]` (Newtonsoft), **NO** `[JsonPropertyName("id")]` (System.Text.Json). El backend SÍ usa System.Text.Json (tiene `CosmosSystemTextJsonSerializer` en Program.cs).

### DashboardWorker (limpieza)

| Archivo actual | Acción |
|---|---|
| `Data/DashboardDbContext.cs` | **Modificar** — Quitar `DbSet<PersonaSync>` |
| `Data/Entities/PersonaSync.cs` | **Eliminar** |
| `Data/Configurations/PersonaSyncConfiguration.cs` | **Eliminar** |

### Frontend

| Archivo actual | Acción |
|---|---|
| `pages/ChangeFeedPage.tsx` | **Reescribir completo** — nuevo modelo Comunicación + agregar eventos |

### SQL

| Archivo | Acción |
|---|---|
| `sql/create-star-model.sql` | **Crear** — DDL de tablas + partition function/scheme + índices + View |
| `sql/usp_UpsertComunicacionGenerica.sql` | **Crear** — Stored procedure upsert |
| `sql/usp_DepurarDiasViejos.sql` | **Crear** — SP de depuración |

> La View `vw_ComunicacionesConDims` va en `create-star-model.sql` junto con las tablas.

### Cosmos

| Recurso | Acción |
|---|---|
| Collection `personas` | Crear nueva `comunicaciones` vía Bicep redeploy (no renombrar) |
| Collection `changefeed-errors` | Mantener (adaptar documento de error) |
| Lease container | Recrear automáticamente (nuevo processor name `cfp-comunicaciones`) |

---

## 7. Configuración a actualizar

```json
// src/worker/ChangeFeedWorker/appsettings.json
{
  "Cosmos": {
    "Database": "change-feed-poc",
    "Collection": "comunicaciones",          // era "personas"
    "ProcessorName": "cfp-comunicaciones",   // era "cfp-personas"
    "VerticalName": "comunicaciones"         // era "personas"
  }
}
```

```json
// src/backend/WeatherApi/appsettings.json (si tiene sección Cosmos)
{
  "Cosmos": {
    "Database": "change-feed-poc",
    "Collection": "comunicaciones"           // era "personas"
  }
}
```

```bicep
// biceps/main.bicep — parámetros
param cosmosCollection string = 'comunicaciones'   // era 'personas'
param processorName string = 'cfp-comunicaciones'  // era 'cfp-personas'
param verticalName string = 'comunicaciones'       // era 'personas'
```

---

## 8. Frontend — Qué cambia

### Estructura de tabs (mantiene 3)

1. **Cosmos Editor** — CRUD de Comunicaciones + agregar eventos
2. **SQL Estrella** — Vista del modelo estrella (Facts + Dims resueltas)
3. **Change Feed** — Contadores (sin cambios)

### Tab 1: Cosmos Editor — Diseño nuevo

#### Formulario "Nueva Comunicación"

Campos del formulario:
- **tipoProceso** (select): `recupero-clave`, `validacion-email`, `aviso-generico`, `tramite`
- **canal** (select): `email`, `sms`
- **contacto** (input text): email o teléfono
- **template** (input text): nombre del template
- **parametros** (textarea JSON): parámetros libres
- **TTL** (input number): segundos (default 3888000 = 45 días)

Al crear: genera `id = "com-" + uuid`, `estado = "pending"`, `fechaCreacion = now`, `eventos = []`

#### Lista de Comunicaciones

Tabla con columnas:
| ID | Tipo | Canal | Contacto | Estado | Eventos | TTL | Acciones |
|---|---|---|---|---|---|---|---|
| `com-abc...` | recupero-clave | email | user@mail.com | `delivered` | 3 | 45d | [📝 Editar] [➕ Evento] [🗑️] |

- **Badge de estado** con colores: pending (gris), accepted (azul), delivered (verde), opened (verde brillante), bounced (rojo)
- **Contador de eventos** clickeable para expandir/colapsar detalle

#### Agregar Evento (inline o modal)

Botón "➕ Evento" en cada comunicación que abre un form inline o modal:

```
┌─────────────────────────────────────────────────┐
│  Agregar Evento a com-abc-123                   │
│                                                 │
│  Tipo de evento: [select: accepted/delivered/   │
│                    opened/bounced/complained/    │
│                    unsubscribed]                 │
│                                                 │
│  Fecha: [datetime-local, default: ahora]        │
│                                                 │
│  [Agregar Evento]   [Cancelar]                  │
└─────────────────────────────────────────────────┘
```

**Endpoint llamado:** `POST /api/cosmos/comunicaciones/{id}/eventos`
**Body:** `{ "tipo": "delivered", "fecha": "2026-07-24T15:00:00Z" }`
**Resultado:** La comunicación se actualiza en Cosmos → Change Feed se dispara → modelo estrella se actualiza

#### Detalle de eventos (expandible)

Al clickear el contador de eventos o expandir una fila:

```
  Eventos de com-abc-123:
  ┌────────────────────────────────────────┐
  │ ✓ accepted   │ 2026-07-24 14:00:03    │
  │ ✓ delivered  │ 2026-07-24 14:02:30    │
  │ ✓ opened     │ 2026-07-24 15:10:00    │
  └────────────────────────────────────────┘
```

### Tab 2: SQL Estrella — Vista del modelo de consumo

Reemplaza "Personas Sincronizadas" por una vista que muestra las Facts con dimensiones resueltas:

**Endpoint:** `GET /api/sync/comunicaciones` (reescrito con JOINs a dims)

Tabla con columnas:
| Tipo | Canal | Contacto | Estado | Fecha Creación | Eventos | Últ. Modif |
|---|---|---|---|---|---|---|
| recupero-clave | email | user@mail.com | delivered | 2026-07-24 | 3 | 14:02:30 |

- Los nombres vienen **resueltos** desde SQL (no IDs de dimensiones)
- Se muestra también la cantidad de eventos en FactEventos por comunicación
- Badge de día para ver en qué partición está cada registro

---

## 9. Checklist de implementación

> **Nota:** No hay ambiente corriendo. La implementación incluye todo para armar desde cero. Los scripts SQL siguen la convención `sql/NNN-nombre.sql` del proyecto y el DEPLOYMENT.md se actualiza para incluirlos en el Paso 6.2.

### Fase 1: SQL (scripts de migración)
- [ ] Crear `sql/004-star-model.sql` — DDL de tablas estrella + partition function/scheme + índices + View `vw_ComunicacionesConDims`
- [ ] Crear `sql/005-usp-upsert-comunicacion.sql` — Stored procedure `usp_UpsertComunicacionGenerica`
- [ ] Crear `sql/006-usp-depurar-dias.sql` — SP de depuración `usp_DepurarDiasViejos`
- [ ] ~~`sql/003-changefeed-tables.sql`~~ — `PersonasSync` ya no se usa, pero el script queda (no rompe nada, `IF NOT EXISTS` lo protege). `ChangeFeedCounters` y `QueueCounters` de ese script **sí siguen siendo necesarios**

> **Convención:** Los scripts usan `IF NOT EXISTS` y son idempotentes. Se ejecutan en orden numérico durante deploy (Paso 6.2 de DEPLOYMENT.md).

### Fase 2: Bicep (infraestructura)
- [ ] Actualizar `biceps/main.bicep` (3 params: cosmosCollection, processorName, verticalName)
- [ ] Actualizar `biceps/modules/cosmos-db.bicep` (container name → comunicaciones)
- [ ] Actualizar `biceps/modules/changefeed-worker-container-app.bicep` (3 defaults: cosmosCollection, processorName, verticalName)
- [ ] Validar: `az bicep build --file biceps/main.bicep`

### Fase 3: Backend
- [ ] Crear `Models/ComunicacionModels.cs` (documento Cosmos + DTOs + requests) — usar `[JsonPropertyName]` (System.Text.Json)
- [ ] Crear `Controllers/CosmosComunicacionesController.cs` (CRUD + endpoint `POST {id}/eventos`)
- [ ] Reescribir `Controllers/SyncController.cs` — ruta `/api/sync/comunicaciones`, usar `SqlQueryRaw` sobre `vw_ComunicacionesConDims`
- [ ] Reescribir `Models/SyncModels.cs` — `ComunicacionSyncDto` con campos resueltos (reemplaza `PersonaSyncDto`)
- [ ] Eliminar `Models/PersonaModels.cs`
- [ ] Eliminar `Controllers/CosmosPersonasController.cs`
- [ ] Eliminar `Data/Entities/PersonaSync.cs`
- [ ] Eliminar `Data/Configurations/PersonaSyncConfiguration.cs`
- [ ] Modificar `Data/DashboardDbContext.cs` — quitar `DbSet<PersonaSync>`
- [ ] Verificar que compila: `dotnet build src/backend/WeatherApi/`

### Fase 4: ChangeFeedWorker
- [ ] Crear `Models/Comunicacion.cs` — usar `[JsonProperty]` (Newtonsoft, NO System.Text.Json)
- [ ] Eliminar `Models/Persona.cs`
- [ ] Modificar `Services/ChangeFeedWorkerService.cs` — `<Persona>` → `<Comunicacion>` en processor builder
- [ ] Modificar `Services/IChangeFeedHandler.cs` — `IReadOnlyCollection<Comunicacion>`
- [ ] Reescribir `Services/ChangeFeedHandler.cs` — SP call con ADO.NET (publicar eventos a SB se mantiene)
- [ ] Actualizar `appsettings.json` (Collection, ProcessorName, VerticalName)
- [ ] Eliminar `Data/Entities/PersonaSync.cs`
- [ ] Modificar `Data/DashboardDbContext.cs` — quitar `DbSet<PersonaSync>`
- [ ] Verificar que compila: `dotnet build src/worker/ChangeFeedWorker/`

### Fase 4b: DashboardWorker (limpieza)
- [ ] Modificar `Data/DashboardDbContext.cs` — quitar `DbSet<PersonaSync>`
- [ ] Eliminar `Data/Entities/PersonaSync.cs`
- [ ] Eliminar `Data/Configurations/PersonaSyncConfiguration.cs`
- [ ] Verificar que compila: `dotnet build src/worker/DashboardWorker/`

### Fase 5: Frontend
- [ ] Reescribir `ChangeFeedPage.tsx` — Tab 1: CRUD comunicaciones + agregar eventos
- [ ] Rutas API: `/api/cosmos/personas` → `/api/cosmos/comunicaciones`, `/api/sync/personas` → `/api/sync/comunicaciones`
- [ ] Tab 2: Vista SQL estrella con dims resueltas (nuevo endpoint `/api/sync/comunicaciones`)
- [ ] Mantener Tab 3: Change Feed contadores (sin cambios, `/api/dashboard/changefeed` sigue igual)
- [ ] Verificar que compila: `npm run build` en `src/frontend/`

### Fase 6: Documentación
- [ ] Actualizar `docs/DEPLOYMENT.md` Paso 6.2 — agregar los 3 scripts nuevos a la lista
- [ ] Actualizar `docs/DEPLOYMENT.md` — tablas esperadas: agregar Facts, Dims, View, SPs

### Fase 7: Deploy desde cero y validación

Seguir DEPLOYMENT.md actualizado. El orden de pasos relevante:

```
Paso 1: Bicep deploy (crea Cosmos collection "comunicaciones", Key Vault, SQL Server, etc.)
Paso 2: Secrets en Key Vault (auth-client-secret-frontend, auth-client-secret-backend)
Paso 3: Build images (backend, frontend, changefeed-worker, dashboard-worker)
Paso 4: Easy Auth (solo si aplica)
Paso 5: Deploy Container Apps
Paso 6: SQL Database
  6.1: CREATE USER para backend + worker identities
  6.2: Ejecutar scripts SQL en orden:
       - sql/001-dashboard-schema.sql
       - sql/002-add-discarded-count.sql
       - sql/003-changefeed-tables.sql    ← sigue siendo necesario (ChangeFeedCounters, QueueCounters)
       - sql/003_JobExecutions.sql
       - sql/004-star-model.sql           ← NUEVO: modelo estrella + particiones + View
       - sql/005-usp-upsert-comunicacion.sql  ← NUEVO: SP upsert
       - sql/006-usp-depurar-dias.sql         ← NUEVO: SP depuración
  6.3: Verificar tablas: SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
Paso 7: Verificación E2E
```

- [ ] Build images: backend, frontend, changefeed-worker, dashboard-worker (4 `az acr build`)
- [ ] Deploy Bicep (Paso 1) — crea Cosmos `comunicaciones`, infra completa
- [ ] Secrets en Key Vault (Paso 2)
- [ ] Deploy Container Apps (Paso 5)
- [ ] SQL: CREATE USER + ejecutar scripts 001-006 en orden (Paso 6)
- [ ] Test E2E: crear comunicación → Change Feed → modelo estrella → consulta API
- [ ] Test agregar evento: POST evento → Change Feed → FactEventos actualizado (MERGE)
- [ ] Test particionado: verificar partition elimination con `SET STATISTICS IO ON`
- [ ] Test depuración: ejecutar `EXEC usp_DepurarDiasViejos @diasARetener = 4`
- [ ] Verificar que datos del día eliminado ya no aparecen en queries
