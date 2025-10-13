-- Extract, transform, and load title_genre_bridge
INSERT into title_genre_bridge (title_id, genre_id)
WITH titles AS (
	SELECT 
	    tconst,
	    TRIM(unnest(string_to_array(genres, ','))) AS genre
	 FROM title_basics tb
	 WHERE genres IS NOT NULL
)
SELECT DISTINCT
    t.tconst,
    gd.genre_id
FROM titles t
JOIN genre_dim gd ON t.genre = gd.genre_name
ORDER BY tconst;