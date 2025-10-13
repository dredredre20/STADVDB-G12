WITH cleaned_crew AS (
    SELECT DISTINCT 
        tc.nconst,
        tc.primaryname,
        CASE
            WHEN tc.birthyear > 2025 AND tc.birthyear < 1600 THEN NULL
            ELSE tc.birthyear:: INT
        END AS birthyear,
        CASE 
            WHEN tc.deathyear > 2025 AND tc.deathyear < 1600 THEN NULL
            ELSE tc.deathyear:: INT
        END AS deathyear

    FROM title_crew tc
    WHERE tc.nconst IS NOT NULL AND tc.primaryname IS NOT NULL 
)

SELECT *
FROM cleaned_crew
WHERE nconst is not null;