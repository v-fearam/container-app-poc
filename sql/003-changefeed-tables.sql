-- Migration: AddChangeFeedTables
-- Generated from: src/worker/DashboardWorker/Migrations/20260716141931_AddChangeFeedTables.cs
-- Run in: Azure Portal → SQL Database dashboard-poc → Query editor

-- ============================================================
-- Table: ChangeFeedCounters
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ChangeFeedCounters' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE TABLE [dbo].[ChangeFeedCounters] (
        [Id]           INT           IDENTITY(1,1) NOT NULL,
        [Collection]   NVARCHAR(200) NOT NULL,
        [Date]         DATE          NOT NULL,
        [SuccessCount] INT           NOT NULL DEFAULT 0,
        [ErrorCount]   INT           NOT NULL DEFAULT 0,
        [UpdatedAt]    DATETIME2     NOT NULL DEFAULT GETUTCDATE(),
        CONSTRAINT [PK_ChangeFeedCounters] PRIMARY KEY ([Id])
    );

    CREATE NONCLUSTERED INDEX [IX_ChangeFeedCounters_Date]
        ON [dbo].[ChangeFeedCounters] ([Date]);

    CREATE UNIQUE NONCLUSTERED INDEX [UQ_ChangeFeedCounters_Collection_Date]
        ON [dbo].[ChangeFeedCounters] ([Collection], [Date]);
END
GO

-- ============================================================
-- Table: PersonasSync
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'PersonasSync' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE TABLE [dbo].[PersonasSync] (
        [Id]               NVARCHAR(100) NOT NULL,
        [Nombre]           NVARCHAR(200) NOT NULL,
        [Apellido]         NVARCHAR(200) NOT NULL,
        [Email]            NVARCHAR(300) NULL,
        [Edad]             INT           NULL,
        [Ciudad]           NVARCHAR(200) NULL,
        [CosmosUpdatedAt]  DATETIME2     NOT NULL,
        [SyncedAt]         DATETIME2     NOT NULL,
        [SyncVersion]      INT           NOT NULL DEFAULT 1,
        CONSTRAINT [PK_PersonasSync] PRIMARY KEY ([Id])
    );

    CREATE NONCLUSTERED INDEX [IX_PersonasSync_Apellido_Nombre]
        ON [dbo].[PersonasSync] ([Apellido], [Nombre]);

    CREATE NONCLUSTERED INDEX [IX_PersonasSync_CosmosUpdatedAt]
        ON [dbo].[PersonasSync] ([CosmosUpdatedAt]);
END
GO

-- ============================================================
-- Table: QueueCounters
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'QueueCounters' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE TABLE [dbo].[QueueCounters] (
        [Id]             INT           IDENTITY(1,1) NOT NULL,
        [Vertical]       NVARCHAR(100) NOT NULL,
        [QueueName]      NVARCHAR(200) NOT NULL,
        [ProcessType]    NVARCHAR(100) NOT NULL,
        [Date]           DATE          NOT NULL,
        [EnqueuedCount]  INT           NOT NULL DEFAULT 0,
        [ProcessedCount] INT           NOT NULL DEFAULT 0,
        [CreatedAt]      DATETIME2     NOT NULL DEFAULT GETUTCDATE(),
        [UpdatedAt]      DATETIME2     NOT NULL DEFAULT GETUTCDATE(),
        CONSTRAINT [PK_QueueCounters] PRIMARY KEY ([Id])
    );

    CREATE NONCLUSTERED INDEX [IX_QueueCounters_Date_Vertical]
        ON [dbo].[QueueCounters] ([Date], [Vertical]);

    CREATE UNIQUE NONCLUSTERED INDEX [UQ_QueueCounters_Vertical_Queue_ProcessType_Date]
        ON [dbo].[QueueCounters] ([Vertical], [QueueName], [ProcessType], [Date]);
END
GO
