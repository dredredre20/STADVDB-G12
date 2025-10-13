-- Extract and transform crew_dim
WITH cleaned_crew AS (
    SELECT DISTINCT 
        tp.nconst,
        nb.primaryname,
        CASE
            WHEN nb.birthyear > 2025 AND nb.birthyear < 1600 THEN NULL
            ELSE nb.birthyear:: INT
        END AS birthyear,
        CASE 
            WHEN nb.deathyear > 2025 AND nb.deathyear < 1600 THEN NULL
            ELSE nb.deathyear:: INT
        END AS deathyear

    FROM title_principals tp
    JOIN name_basics nb ON tp.nconst = nb.nconst  
    WHERE tp.nconst IS NOT NULL AND nb.primaryname IS NOT NULL 
)
SELECT *
FROM cleaned_crew
