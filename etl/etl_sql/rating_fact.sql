INSERT INTO rating_fact(title_id, average_rating, num_votes)
WITH cleaned_ratings AS (
    SELECT DISTINCT
        tr.tconst,
        CAST(averageRating AS NUMERIC) AS averageRating, 
        CAST(numVotes AS INT) AS numVotes
    FROM title_ratings tr
    JOIN title_basics tb ON tr.tconst = tb.tconst
    WHERE tr.tconst IS NOT NULL
      AND averageRating IS NOT NULL
      AND numVotes IS NOT NULL
      AND CAST(averageRating AS NUMERIC) BETWEEN 0.0 AND 10.0
      AND CAST(numVotes AS INT) >= 0
)
SELECT *
FROM cleaned_ratings