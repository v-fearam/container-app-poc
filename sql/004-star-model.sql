-- ============================================================
-- 004-star-model.sql
-- Modelo estrella para Comunicaciones (Change Feed → SQL)
-- Particionado por día del año (1-366), retención 4 días (POC)
-- ============================================================

-- ============================================================
-- Partition Function: por día del año (1-366)
-- RANGE RIGHT: boundary es el primer valor de la partición
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.partition_functions WHERE name = 'pf_Diaria')
BEGIN
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
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.partition_schemes WHERE name = 'ps_Diaria')
BEGIN
    CREATE PARTITION SCHEME ps_Diaria
    AS PARTITION pf_Diaria
    ALL TO ([PRIMARY]);
END
GO

-- ============================================================
-- Dimensiones (no particionadas — son pequeñas)
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'DimTipos')
CREATE TABLE DimTipos (
    id       INT IDENTITY(1,1) PRIMARY KEY,
    Nombre   NVARCHAR(200) NOT NULL UNIQUE
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'DimFechas')
CREATE TABLE DimFechas (
    id        INT IDENTITY(1,1) PRIMARY KEY,
    [Date]    DATE NOT NULL UNIQUE,
    dia       INT NOT NULL,
    mes       INT NOT NULL,
    anio      INT NOT NULL,
    trimestre INT NOT NULL,
    semana    INT NOT NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'DimCanales')
CREATE TABLE DimCanales (
    id       INT IDENTITY(1,1) PRIMARY KEY,
    Nombre   NVARCHAR(100) NOT NULL UNIQUE
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'DimContactos')
CREATE TABLE DimContactos (
    id       INT IDENTITY(1,1) PRIMARY KEY,
    contacto NVARCHAR(500) NOT NULL,
    tipo     NVARCHAR(100) NOT NULL,
    CONSTRAINT UQ_DimContactos UNIQUE (contacto, tipo)
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'DimEstadio')
CREATE TABLE DimEstadio (
    id       INT IDENTITY(1,1) PRIMARY KEY,
    Nombre   NVARCHAR(200) NOT NULL UNIQUE
);
GO

-- ============================================================
-- Facts (PARTICIONADAS por dia_creacion)
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'FactComunicacionesGenericas')
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
    CONSTRAINT PK_FactComunicaciones PRIMARY KEY (id, dia_creacion)
) ON ps_Diaria(dia_creacion);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'FactEventosGenericas')
CREATE TABLE FactEventosGenericas (
    id                  BIGINT IDENTITY(1,1) NOT NULL,
    idFactComunicacion  BIGINT NOT NULL,
    idFecha             INT NOT NULL,
    idEstadio           INT NOT NULL,
    dia_creacion        INT NOT NULL,
    CONSTRAINT PK_FactEventos PRIMARY KEY (id, dia_creacion)
) ON ps_Diaria(dia_creacion);
GO

-- ============================================================
-- Índices (todos alineados con partición para TRUNCATE PARTITION)
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_FactComm_CosmosId')
CREATE UNIQUE NONCLUSTERED INDEX IX_FactComm_CosmosId 
ON FactComunicacionesGenericas(cosmosId, dia_creacion)
ON ps_Diaria(dia_creacion);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_FactComm_Contacto_Fecha')
CREATE NONCLUSTERED INDEX IX_FactComm_Contacto_Fecha
ON FactComunicacionesGenericas(idContacto, idFecha)
INCLUDE (idTipo, idCanal, idEstadio, nroComprobante)
ON ps_Diaria(dia_creacion);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_FactEventos_Comunicacion')
CREATE NONCLUSTERED INDEX IX_FactEventos_Comunicacion
ON FactEventosGenericas(idFactComunicacion)
INCLUDE (idFecha, idEstadio)
ON ps_Diaria(dia_creacion);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_FactComm_Fecha')
CREATE NONCLUSTERED INDEX IX_FactComm_Fecha
ON FactComunicacionesGenericas(idFecha, dia_creacion)
ON ps_Diaria(dia_creacion);
GO

-- ============================================================
-- View: Comunicaciones con dimensiones resueltas
-- ============================================================

GO
CREATE OR ALTER VIEW vw_ComunicacionesConDims AS
SELECT 
    f.id,
    f.cosmosId,
    f.fecha_creacion   AS fechaCreacion,
    f.fechaUltimaModif,
    f.parametros,
    f.dia_creacion     AS diaCreacion,
    dt.Nombre          AS tipoProceso,
    dc.Nombre          AS canal,
    dco.contacto,
    dco.tipo           AS tipoContacto,
    de.Nombre          AS estado,
    df.[Date]          AS fechaDate,
    (SELECT COUNT(*) FROM FactEventosGenericas fe 
     WHERE fe.idFactComunicacion = f.id AND fe.dia_creacion = f.dia_creacion) AS cantEventos
FROM FactComunicacionesGenericas f
INNER JOIN DimTipos dt ON f.idTipo = dt.id
INNER JOIN DimCanales dc ON f.idCanal = dc.id
INNER JOIN DimContactos dco ON f.idContacto = dco.id
INNER JOIN DimEstadio de ON f.idEstadio = de.id
INNER JOIN DimFechas df ON f.idFecha = df.id;
GO

PRINT '004-star-model.sql completed successfully';
GO
