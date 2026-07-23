-- Dashboard POC - SQL Database schema
-- Ejecutar después de mapear la User Assigned Managed Identity como usuario SQL
-- IDEMPOTENTE: puede ejecutarse múltiples veces sin error

-- ============================================================
-- Table: QueueCounters
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'QueueCounters' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
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
        
        CONSTRAINT UQ_QueueCounters_Vertical_Queue_ProcessType_Date 
            UNIQUE (Vertical, QueueName, ProcessType, Date)
    );

    CREATE NONCLUSTERED INDEX IX_QueueCounters_Vertical_Date 
        ON dbo.QueueCounters(Vertical, Date) 
        INCLUDE (QueueName, ProcessType, EnqueuedCount, ProcessedCount, DiscardedCount);
END
GO

-- ============================================================
-- Table: ComponentHealth
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ComponentHealth' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE TABLE dbo.ComponentHealth (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        ComponentName NVARCHAR(100) NOT NULL,
        ComponentType NVARCHAR(50) NOT NULL,
        InstanceId NVARCHAR(255) NOT NULL,
        Status NVARCHAR(20) NOT NULL,
        LastHeartbeat DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
        Version NVARCHAR(50) NULL,
        Metadata NVARCHAR(MAX) NULL,
        
        CONSTRAINT UQ_ComponentHealth_Component_Instance 
            UNIQUE (ComponentName, InstanceId)
    );

    CREATE NONCLUSTERED INDEX IX_ComponentHealth_Type_Status 
        ON dbo.ComponentHealth(ComponentType, Status) 
        INCLUDE (ComponentName, LastHeartbeat);
END
GO

-- ============================================================
-- Table: JobExecutions
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'JobExecutions' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE TABLE dbo.JobExecutions (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        JobName NVARCHAR(255) NOT NULL,
        Date DATE NOT NULL,
        Hour INT NOT NULL,
        ExecutionCount INT NOT NULL DEFAULT 0,
        SuccessCount INT NOT NULL DEFAULT 0,
        FailureCount INT NOT NULL DEFAULT 0,
        CreatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
        UpdatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
        
        CONSTRAINT UQ_JobExecutions_JobName_Date_Hour 
            UNIQUE (JobName, Date, Hour)
    );

    CREATE NONCLUSTERED INDEX IX_JobExecutions_JobName_Date 
        ON dbo.JobExecutions(JobName, Date) 
        INCLUDE (Hour, ExecutionCount, SuccessCount, FailureCount);
END
GO
