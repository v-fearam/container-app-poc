-- ============================================================
-- 006-usp-depurar-dias.sql
-- SP de depuración: elimina particiones con datos > N días
-- Usa TRUNCATE ... WITH (PARTITIONS(n)) — instantáneo
-- ============================================================

CREATE OR ALTER PROCEDURE usp_DepurarDiasViejos
    @diasARetener INT = 4
AS
BEGIN
    SET NOCOUNT ON;
    
    DECLARE @diaActual INT = DATEPART(DAYOFYEAR, GETUTCDATE());
    DECLARE @diaLimite INT = @diaActual - @diasARetener;
    
    -- Si cruza el año (ej: día actual = 3, retener 4 → limite = -1)
    -- Para la POC simplificamos: solo borrar si limite > 0
    IF @diaLimite <= 0
    BEGIN
        PRINT 'Nada que depurar (cruce de año, POC no lo maneja)';
        RETURN;
    END
    
    DECLARE @dia INT = 1;
    DECLARE @partNum INT;
    
    WHILE @dia < @diaLimite
    BEGIN
        SET @partNum = $PARTITION.pf_Diaria(@dia);
        
        -- Solo si la partición tiene datos
        IF EXISTS (
            SELECT 1 FROM sys.partitions p
            INNER JOIN sys.tables t ON p.object_id = t.object_id
            WHERE t.name = 'FactComunicacionesGenericas'
              AND p.index_id <= 1
              AND p.partition_number = @partNum
              AND p.rows > 0
        )
        BEGIN
            PRINT CONCAT('Depurando día ', @dia, ' (partición ', @partNum, ')...');
            
            TRUNCATE TABLE FactEventosGenericas
            WITH (PARTITIONS (@partNum));
            
            TRUNCATE TABLE FactComunicacionesGenericas
            WITH (PARTITIONS (@partNum));
            
            PRINT CONCAT('Día ', @dia, ' depurado OK');
        END
        
        SET @dia = @dia + 1;
    END
    
    -- Limpiar DimFechas huérfanas
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

PRINT '006-usp-depurar-dias.sql completed successfully';
GO
