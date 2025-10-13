-- Extract and transform title_dim
WITH cleaned_title AS (
    SELECT DISTINCT
        tb.tconst,
        COALESCE(tb.primarytitle, tb.originaltitle) AS title_name,
        tb.titletype,
        tb.runtimeminutes::INT AS runtimeminutes,
        tb.startyear::INT AS startyear,
        tb.isadult,
        te.parenttconst,
        te.seasonnumber,
        te.episodenumber,
        tb.endyear::INT AS endyear
    FROM title_basics tb
    LEFT JOIN title_episode te ON tb.tconst = te.tconst
    WHERE tb.tconst IS NOT NULL
      AND COALESCE(tb.primarytitle, tb.originaltitle) IS NOT NULL
)
SELECT *
FROM cleaned_title
ORDER BY tconst
