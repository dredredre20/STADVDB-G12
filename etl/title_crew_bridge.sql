-- Extract, transform, and load title_crew_bridge
INSERT INTO title_crew_bridge(title_id, crew_id, job_category)
WITH cleaned_title_crew AS (
    SELECT DISTINCT
        tp.tconst,
        tp.nconst,
        CASE
            WHEN tp.category IN ('actor','actress','archive_footage','archive_sound','casting_director',
                                 'cinematographer','composer','director','editor','producer',
                                 'production_designer','self','writer')
            THEN tp.category::film_role
            ELSE NULL
        END AS job_category
    FROM title_principals tp
    WHERE tp.tconst IS NOT NULL 
      AND tp.nconst IS NOT NULL
)
SELECT 
    ctc.tconst,
    ctc.nconst,
    ctc.job_category
FROM cleaned_title_crew ctc
JOIN crew_dim cd 
    ON cd.crew_id = ctc.nconst
WHERE ctc.job_category IS NOT NULL
ORDER BY ctc.tconst;