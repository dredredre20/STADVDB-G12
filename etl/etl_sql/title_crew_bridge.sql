-- Extract and transform title_crew_bridge
WITH cleaned_title_crew AS (
    SELECT DISTINCT
        tp.tconst,
        tp.nconst,
        COALESCE(tp.category, 'Extra') AS category
    FROM title_principals tp
)
SELECT *
FROM cleaned_title_crew
WHERE tconst is not null and nconst is not null;