-- Extract and transform title_dim
WITH cleaned_title AS (
    SELECT DISTINCT
        tb.tconst,
        tb.titletype,
        COALESCE(tb.primarytitle, tb.originaltitle) AS title_name,
        tb.startyear::INT AS startyear,
        tb.endyear::INT AS endyear,
        tb.runtimeminutes::INT AS runtimeminutes,
        COALESCE(tb.genres, 'Unknown') AS genres,
        te.seasonnumber,
        te.episodenumber
    FROM title_basics tb
    LEFT JOIN title_episode te ON tb.tconst = te.tconst
    WHERE tb.tconst IS NOT NULL
      AND COALESCE(tb.primarytitle, tb.originaltitle) IS NOT NULL
)
SELECT *
FROM cleaned_title
WHERE genres = 'Unknown'