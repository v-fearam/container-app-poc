-- Migration: Add DiscardedCount column to QueueCounters
-- Tracks messages manually discarded from DLQ via the Dashboard UI

IF NOT EXISTS (
    SELECT 1 FROM sys.columns 
    WHERE object_id = OBJECT_ID('dbo.QueueCounters') AND name = 'DiscardedCount'
)
BEGIN
    ALTER TABLE dbo.QueueCounters 
        ADD DiscardedCount INT NOT NULL DEFAULT 0;
END
GO

-- Update index to include new column (recreate is idempotent)
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_QueueCounters_Vertical_Date' AND object_id = OBJECT_ID('dbo.QueueCounters'))
    DROP INDEX IX_QueueCounters_Vertical_Date ON dbo.QueueCounters;
GO

CREATE NONCLUSTERED INDEX IX_QueueCounters_Vertical_Date 
    ON dbo.QueueCounters(Vertical, Date) 
    INCLUDE (QueueName, ProcessType, EnqueuedCount, ProcessedCount, DiscardedCount);
GO
