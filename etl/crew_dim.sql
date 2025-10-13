-- Extract, transform, and load crew_dim
INSERT INTO crew_dim (crew_id, primary_name, birth_year, death_year)
WITH cleaned_crew AS (
    SELECT 
        tp.nconst,
        MAX(nb.primaryname) AS primaryname,
        MIN(
            CASE WHEN nb.birthyear BETWEEN 1600 AND 2025 THEN nb.birthyear::INT END
        ) AS birthyear,
        MIN(
            CASE WHEN nb.deathyear BETWEEN 1600 AND 2025 THEN nb.deathyear::INT END
        ) AS deathyear
    FROM title_principals tp
    JOIN name_basics nb ON tp.nconst = nb.nconst  
    WHERE tp.nconst IS NOT NULL AND nb.primaryname IS NOT NULL 
    GROUP BY tp.nconst
)
SELECT nconst, primaryname, birthyear, deathyear
FROM cleaned_crew
ORDER BY nconst;
