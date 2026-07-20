-- Migration: JobExecutions Table
-- Date: 2026-07-20
-- Purpose: Track Container Apps Jobs execution history for dashboard

CREATE TABLE [dbo].[JobExecutions] (
    [Id] INT IDENTITY(1,1) NOT NULL,
    [JobName] NVARCHAR(100) NOT NULL,
    [Date] DATE NOT NULL,
    [Hour] INT NOT NULL CHECK ([Hour] >= 0 AND [Hour] <= 23),
    [ExecutionCount] INT NOT NULL DEFAULT 0,
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT [PK_JobExecutions] PRIMARY KEY CLUSTERED ([Id]),
    CONSTRAINT [UQ_JobExecutions_JobName_Date_Hour] UNIQUE ([JobName], [Date], [Hour])
);

CREATE INDEX [IX_JobExecutions_Date_JobName] ON [dbo].[JobExecutions] ([Date] DESC, [JobName]);

GO

-- Verification query
SELECT 
    t.name AS TableName,
    c.name AS ColumnName,
    ty.name AS DataType,
    c.max_length,
    c.is_nullable,
    c.is_identity
FROM sys.tables t
INNER JOIN sys.columns c ON t.object_id = c.object_id
INNER JOIN sys.types ty ON c.user_type_id = ty.user_type_id
WHERE t.name = 'JobExecutions'
ORDER BY c.column_id;

-- Verify indexes
SELECT 
    i.name AS IndexName,
    i.type_desc AS IndexType,
    i.is_unique,
    STRING_AGG(col.name, ', ') WITHIN GROUP (ORDER BY ic.key_ordinal) AS Columns
FROM sys.indexes i
INNER JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
INNER JOIN sys.columns col ON ic.object_id = col.object_id AND ic.column_id = col.column_id
WHERE i.object_id = OBJECT_ID('dbo.JobExecutions')
GROUP BY i.name, i.type_desc, i.is_unique;
