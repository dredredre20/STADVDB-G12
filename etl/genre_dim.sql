-- Extract and transform genre dim
WITH genres AS (
    SELECT DISTINCT
        TRIM(unnest(string_to_array(genres, ','))) AS genre
    FROM title_basics
    WHERE genres IS NOT NULL
)
SELECT
    ROW_NUMBER() OVER (ORDER BY genre) AS genre_id,
    genre
FROM genres
ORDER BY genre_id;