-- Extract, transform, and load genre_dim
INSERT INTO genre_dim (genre_id, genre_name)
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