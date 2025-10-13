-- Extract, transform, and load title_dim
INSERT INTO title_dim (title_id, title_name, 
title_type, runtime_mins, start_year, is_adult, 
parent_title_id, season_num, episode_num, end_year)
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
SELECT 
	tconst, title_name, titletype, runtimeminutes, 
	CASE WHEN startyear IS NOT NULL THEN make_date(startyear, 1, 1) END,
    CASE WHEN isadult = '1' THEN TRUE ELSE FALSE END,
    parenttconst, seasonnumber, episodenumber, 
    CASE WHEN endyear IS NOT NULL THEN make_date(endyear, 1, 1) END
FROM cleaned_title;