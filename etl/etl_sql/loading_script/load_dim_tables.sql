-- Load to genre_dim
insert into genre_dim (genre_id, genre_name)
WITH genres AS (
    SELECT DISTINCT
        TRIM(UNNEST(STRING_TO_ARRAY(genres, ','))) AS genre
    FROM title_basics
    WHERE genres IS NOT NULL
)
SELECT
    ROW_NUMBER() OVER (ORDER BY genre) AS genre_id,
    genre
FROM genres
ORDER BY genre_id;



-- Load to crew_dim
insert into crew_dim(crew_id, job_category, primary_name, birth_year, death_year)
WITH cleaned_crew AS (
    SELECT DISTINCT 
        tp.nconst,
        COALESCE(tp.category, 'Extra') AS category,
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
SELECT 
	cc.nconst, 
	COALESCE(ctc.category, 'Extra') AS category,
	cc.primaryname, 
	CASE WHEN birthyear IS NOT NULL THEN make_date(birthyear, 1, 1) END,
    CASE WHEN deathyear IS NOT NULL THEN make_date(deathyear, 1, 1) END
FROM cleaned_crew cc
-- BRUH HIND AKO SURE
join cleaned_title_crew ctc on  cc.nconst = ctc.nconst
where nconst is not null;



-- Load to title_dim
insert into title_dim (title_id, title_name, 
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
    CASE WHEN endyear IS NOT NULL THEN make_date(endyear, 1, 1) END,
FROM cleaned_title;









