-- Extract and transform title_genre_bridge
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
ORDER BY tconst