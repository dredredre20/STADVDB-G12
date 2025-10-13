-- Load title_genre_bridge
insert into title_genre_bridge (title_id, genre_id)
WITH genres AS (
    SELECT DISTINCT
        TRIM(UNNEST(STRING_TO_ARRAY(genres, ','))) AS genre
    FROM title_basics
    WHERE genres IS NOT NULL
),
genre_with_id AS (
	SELECT
		genre,
		ROW_NUMBER() OVER (ORDER BY genres) AS genre_id
	FROM genres
),
titles AS (
	SELECT 
	    tconst,
	    TRIM(unnest(string_to_array(genres, ','))) AS genre
	 FROM title_basics tb
	 WHERE genres IS NOT NULL
)
SELECT DISTINCT
    t.tconst,
    gi.genre_id
FROM titles t
JOIN genre_with_id gi ON t.genre = gi.genre
ORDER BY tconst;


-- Load title_crew_bridge
insert into title_crew_bridge(title_id, crew_id)
WITH cleaned_title_crew AS (
    SELECT DISTINCT
        tp.tconst,
        tp.nconst,
        COALESCE(tp.category, 'Extra') AS category
    FROM title_principals tp
    where tp.tconst is not null and
    		tp.nconst
)
SELECT *
FROM cleaned_title_crew
WHERE tconst is not null and nconst is not null;


select *
from title_genre_bridge;



