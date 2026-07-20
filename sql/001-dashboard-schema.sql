-- Dashboard POC - SQL Database schema
-- Ejecutar después de mapear la User Assigned Managed Identity como usuario SQL

-- Tabla de contadores por vertical + cola + tipo de proceso + día
CREATE TABLE dbo.QueueCounters (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    Vertical NVARCHAR(50) NOT NULL,
    QueueName NVARCHAR(255) NOT NULL,
    ProcessType NVARCHAR(100) NOT NULL,
    Date DATE NOT NULL,
    EnqueuedCount INT NOT NULL DEFAULT 0,
    ProcessedCount INT NOT NULL DEFAULT 0,
    DiscardedCount INT NOT NULL DEFAULT 0,
    CreatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    UpdatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    
    -- Constraint única por combinación vertical + cola + tipo + fecha
    CONSTRAINT UQ_QueueCounters_Vertical_Queue_ProcessType_Date 
        UNIQUE (Vertical, QueueName, ProcessType, Date)
);

-- Índice para queries del Dashboard (por vertical + fecha)
CREATE NONCLUSTERED INDEX IX_QueueCounters_Vertical_Date 
    ON dbo.QueueCounters(Vertical, Date) 
    INCLUDE (QueueName, ProcessType, EnqueuedCount, ProcessedCount, DiscardedCount);

-- Tabla de health de componentes (heartbeat de workers)
CREATE TABLE dbo.ComponentHealth (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    ComponentName NVARCHAR(100) NOT NULL,
    ComponentType NVARCHAR(50) NOT NULL, -- 'Worker', 'API', 'DashboardWorker'
    InstanceId NVARCHAR(255) NOT NULL, -- Replica/pod name
    Status NVARCHAR(20) NOT NULL, -- 'Healthy', 'Degraded', 'Unhealthy'
    LastHeartbeat DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    Version NVARCHAR(50) NULL,
    Metadata NVARCHAR(MAX) NULL, -- JSON con info adicional
    
    -- Constraint única por componente + instancia
    CONSTRAINT UQ_ComponentHealth_Component_Instance 
        UNIQUE (ComponentName, InstanceId)
);

-- Índice para queries de health (por tipo + status)
CREATE NONCLUSTERED INDEX IX_ComponentHealth_Type_Status 
    ON dbo.ComponentHealth(ComponentType, Status) 
    INCLUDE (ComponentName, LastHeartbeat);

-- Tabla de ejecuciones de Container App Jobs (agregaciones por hora)
CREATE TABLE dbo.JobExecutions (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    JobName NVARCHAR(255) NOT NULL,
    Date DATE NOT NULL,
    Hour INT NOT NULL, -- 0-23
    ExecutionCount INT NOT NULL DEFAULT 0,
    SuccessCount INT NOT NULL DEFAULT 0,
    FailureCount INT NOT NULL DEFAULT 0,
    CreatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    UpdatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    
    -- Constraint única por job + date + hour
    CONSTRAINT UQ_JobExecutions_JobName_Date_Hour 
        UNIQUE (JobName, Date, Hour)
);

-- Índice para queries del Dashboard (por job + date)
CREATE NONCLUSTERED INDEX IX_JobExecutions_JobName_Date 
    ON dbo.JobExecutions(JobName, Date) 
    INCLUDE (Hour, ExecutionCount, SuccessCount, FailureCount);

GO
