-- Migration: JobExecutions Table
-- Date: 2026-07-20
-- Purpose: Track Container Apps Jobs execution history for dashboard
-- IDEMPOTENTE: puede ejecutarse múltiples veces sin error

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'JobExecutions' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE TABLE [dbo].[JobExecutions] (
        [Id] INT IDENTITY(1,1) NOT NULL,
        [JobName] NVARCHAR(255) NOT NULL,
        [Date] DATE NOT NULL,
        [Hour] INT NOT NULL CHECK ([Hour] >= 0 AND [Hour] <= 23),
        [ExecutionCount] INT NOT NULL DEFAULT 0,
        [SuccessCount] INT NOT NULL DEFAULT 0,
        [FailureCount] INT NOT NULL DEFAULT 0,
        [CreatedAt] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
        [UpdatedAt] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
        CONSTRAINT [PK_JobExecutions] PRIMARY KEY CLUSTERED ([Id]),
        CONSTRAINT [UQ_JobExecutions_JobName_Date_Hour] UNIQUE ([JobName], [Date], [Hour])
    );

    CREATE NONCLUSTERED INDEX [IX_JobExecutions_Date_JobName] 
        ON [dbo].[JobExecutions] ([Date] DESC, [JobName]) 
        INCLUDE ([Hour], [ExecutionCount], [SuccessCount], [FailureCount]);
END
GO
