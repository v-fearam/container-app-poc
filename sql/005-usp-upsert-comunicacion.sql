-- ============================================================
-- 005-usp-upsert-comunicacion.sql
-- SP transaccional: Change Feed → Modelo Estrella
-- Hace MERGE en dimensiones + Facts en una sola llamada
-- ============================================================

CREATE OR ALTER PROCEDURE usp_UpsertComunicacionGenerica
    @cosmosId           NVARCHAR(100),
    @fechaCreacion      DATETIME2,
    @fechaUltimaModif   DATETIME2,
    @estado             NVARCHAR(200),
    @tipoProceso        NVARCHAR(200),
    @canal              NVARCHAR(100),
    @contacto           NVARCHAR(500),
    @tipoContacto       NVARCHAR(100),
    @nroComprobante     NVARCHAR(200) = NULL,
    @parametros         NVARCHAR(MAX) = NULL,
    @eventosJson        NVARCHAR(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    BEGIN TRY
    BEGIN TRANSACTION;
    
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
        ROLLBACK TRANSACTION;
        RETURN;
    END
    
    -- ================================================================
    -- 3. MERGE FactEventosGenericas (de JSON array)
    -- ================================================================
    
    IF @eventosJson IS NOT NULL AND LEN(@eventosJson) > 2
    BEGIN
        -- Ensure event dimensions exist (same INSERT-ignore pattern)
        -- DimEstadio for each distinct event tipo
        DECLARE @eventoTipo NVARCHAR(200);
        DECLARE tipoCursor CURSOR LOCAL FAST_FORWARD FOR
            SELECT DISTINCT tipo FROM OPENJSON(@eventosJson) WITH (tipo NVARCHAR(200) '$.tipo');
        OPEN tipoCursor;
        FETCH NEXT FROM tipoCursor INTO @eventoTipo;
        WHILE @@FETCH_STATUS = 0
        BEGIN
            BEGIN TRY
                INSERT INTO DimEstadio (Nombre) VALUES (@eventoTipo);
            END TRY
            BEGIN CATCH
                IF ERROR_NUMBER() NOT IN (2601, 2627) THROW;
            END CATCH
            FETCH NEXT FROM tipoCursor INTO @eventoTipo;
        END
        CLOSE tipoCursor;
        DEALLOCATE tipoCursor;
        
        -- DimFechas for each distinct event date
        DECLARE @eventoFecha DATE;
        DECLARE fechaCursor CURSOR LOCAL FAST_FORWARD FOR
            SELECT DISTINCT CAST(fecha AS DATE) FROM OPENJSON(@eventosJson) WITH (fecha DATETIME2 '$.fecha');
        OPEN fechaCursor;
        FETCH NEXT FROM fechaCursor INTO @eventoFecha;
        WHILE @@FETCH_STATUS = 0
        BEGIN
            BEGIN TRY
                INSERT INTO DimFechas ([Date], dia, mes, anio, trimestre, semana)
                VALUES (@eventoFecha, DAY(@eventoFecha), MONTH(@eventoFecha), 
                        YEAR(@eventoFecha), DATEPART(QUARTER, @eventoFecha),
                        DATEPART(ISO_WEEK, @eventoFecha));
            END TRY
            BEGIN CATCH
                IF ERROR_NUMBER() NOT IN (2601, 2627) THROW;
            END CATCH
            FETCH NEXT FROM fechaCursor INTO @eventoFecha;
        END
        CLOSE fechaCursor;
        DEALLOCATE fechaCursor;
        
        -- Upsert eventos: dedup by tipo (last wins), prevents MERGE error 8672
        ;WITH EventosDedup AS (
            SELECT 
                e.tipo,
                e.fecha,
                ROW_NUMBER() OVER (PARTITION BY e.tipo ORDER BY e.fecha DESC) AS rn
            FROM OPENJSON(@eventosJson)
            WITH (
                tipo NVARCHAR(200) '$.tipo',
                fecha DATETIME2 '$.fecha'
            ) e
        )
        MERGE FactEventosGenericas AS target
        USING (
            SELECT 
                @idFactComunicacion AS idFactComunicacion,
                df.id AS idFecha,
                de.id AS idEstadio,
                @diaCreacion AS dia_creacion
            FROM EventosDedup ed
            INNER JOIN DimEstadio de ON de.Nombre = ed.tipo
            INNER JOIN DimFechas df ON df.[Date] = CAST(ed.fecha AS DATE)
            WHERE ed.rn = 1
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
    
    COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END
GO

PRINT '005-usp-upsert-comunicacion.sql completed successfully';
GO
