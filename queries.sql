-- [ROLLUP]
SELECT  gd.genre_id, 
            gd.genre_name, 
            ROUND(AVG(rf.average_rating ),3) AS average_rating_per_genre
    FROM title_dim td  JOIN rating_fact rf ON td.title_id = rf.title_id  
    JOIN title_genre_bridge tgb ON td.title_id = tgb.title_id  
    JOIN genre_dim gd ON tgb.genre_id = gd.genre_id  
    GROUP BY gd.genre_id 
    ORDER BY average_rating_per_genre DESC;

SELECT  gd.genre_id,
		gd.genre_name, 
		SUM(rf.num_votes) AS num_votes_per_genre
    FROM title_dim td 
    JOIN rating_fact rf ON td.title_id = rf.title_id 
    JOIN title_genre_bridge tgb ON td.title_id = tgb.title_id 
    JOIN genre_dim gd ON tgb.genre_id = gd.genre_id 
    GROUP BY gd.genre_id 
    ORDER BY num_votes_per_genre DESC;

-- [DRILL-DOWN]
WITH ranked_titles_by_rating AS(
        SELECT  gd.genre_name,
                td.title_name,
                rf.average_rating,
                ROW_NUMBER() OVER (PARTITION BY genre_name ORDER BY rf.average_rating DESC) AS title_ranking,
                rf.num_votes
        FROM genre_dim gd
        JOIN title_genre_bridge tgb ON gd.genre_id = tgb.genre_id 
        JOIN rating_fact rf ON tgb.title_id = rf.title_id 
        JOIN title_dim td ON rf.title_id = td.title_id 
        WHERE title_type = 'movie'
            AND num_votes > 100 -- to ensure it has adequate reviews;
    )
    SELECT  rtbp.genre_name,
            rtbp.title_name,
            rtbp.average_rating,
            rtbp.num_votes
    FROM ranked_titles_by_rating rtbp
    WHERE title_ranking <= 3;

WITH ranked_titles_by_rating AS(
        SELECT  gd.genre_name,
                td.title_name,
                rf.average_rating,
                ROW_NUMBER() OVER (PARTITION BY genre_name ORDER BY rf.average_rating DESC) AS title_ranking,
                rf.num_votes
        FROM genre_dim gd
        JOIN title_genre_bridge tgb ON gd.genre_id = tgb.genre_id 
        JOIN rating_fact rf ON tgb.title_id = rf.title_id 
        JOIN title_dim td ON rf.title_id = td.title_id 
        WHERE title_type = 'movie'
            AND num_votes > 100 -- to ensure it has adequate reviews;
    )
    SELECT  rtbp.genre_name,
            rtbp.title_name,
            rtbp.average_rating,
            rtbp.num_votes
    FROM ranked_titles_by_rating rtbp
    WHERE title_ranking <= 3;

WITH ranked_titles_by_popularity AS(
        SELECT  gd.genre_name,
                td.title_name,
                rf.num_votes,
                ROW_NUMBER() OVER (PARTITION BY genre_name ORDER BY rf.num_votes DESC) AS title_ranking,
                rf.average_rating
        FROM genre_dim gd
        JOIN title_genre_bridge tgb ON gd.genre_id = tgb.genre_id 
        JOIN rating_fact rf ON tgb.title_id = rf.title_id 
        JOIN title_dim td ON rf.title_id = td.title_id 
    )
    SELECT  rtbp.genre_name,
            rtbp.title_name,
            rtbp.num_votes,
            rtbp.average_rating
    FROM ranked_titles_by_popularity rtbp
    WHERE title_ranking <= 3;

-- [SLICE]
SELECT  primary_name, 
		count(cd.crew_id) AS popular_film_count
FROM title_crew_bridge tcb
JOIN crew_dim cd ON cd.crew_id = tcb.crew_id 
JOIN rating_fact rc ON tcb.title_id = rc.title_id 
WHERE (tcb.job_category = 'actor' OR tcb.job_category = 'actress')
	AND rc.num_votes > 1000000
GROUP BY cd.crew_id
ORDER BY popular_film_count DESC 
LIMIT 20

-- [DICE]
SELECT 
    t.title_name,
    t.title_type,
    g.genre_name,
    t.start_year,
    f.average_rating,
    f.num_votes
FROM rating_fact f
JOIN title_dim t 
    ON f.title_id = t.title_id
JOIN title_genre_bridge tg 
    ON t.title_id = tg.title_id
JOIN genre_dim g 
    ON tg.genre_id = g.genre_id
WHERE 
    t.title_type = 'movie'
    AND g.genre_name IN ('Romance', 'Comedy', 'Drama')
    AND t.start_year >= '2010-01-01'
    AND f.num_votes >= 100000
ORDER BY f.average_rating DESC, f.num_votes DESC
LIMIT 30;

-- [CUBE]
SELECT 
    g.genre_name,
    t.title_type,
    SUM(f.num_votes) AS total_votes
FROM rating_fact f
JOIN title_dim t ON f.title_id = t.title_id
JOIN title_genre_bridge tg ON t.title_id = tg.title_id
JOIN genre_dim g ON tg.genre_id = g.genre_id
GROUP BY CUBE (g.genre_name, t.title_type)
ORDER BY g.genre_name, t.title_type, total_votes DESC;

-- [PIVOT]
SELECT g.genre_name,
    ROUND(AVG(CASE WHEN t.title_type = 'movie' THEN r.average_rating END), 2) AS movie,
    ROUND(AVG(CASE WHEN t.title_type IN ('tvSeries', 'tvMiniSeries') THEN r.average_rating END), 2) AS series,
    ROUND(AVG(CASE WHEN t.title_type = 'short' THEN r.average_rating END), 2) AS short
FROM rating_fact r
JOIN title_dim t USING (title_id)
JOIN title_genre_bridge tg USING (title_id)
JOIN genre_dim g USING (genre_id)
GROUP BY g.genre_name
ORDER BY g.genre_name;


-- [STATISTICAL ANALYSIS - MAD]
with median as ( 
	select 
		td.title_type,
		PERCENTILE_CONT(0.5) within group (order by rf.average_rating) as median_rating
	from rating_fact rf
	join title_dim td on td.title_id = rf.title_id
	where rf.average_rating is not null and td.title_type is not null
	group by td.title_type
) 
select 
	td.title_type, 
	AVG(ABS(rf.average_rating - m.median_rating)) as mad_median
from rating_fact rf
join title_dim td on td.title_id = rf.title_id 
join median m on m.title_type = td.title_type
where rf.average_rating is not null and td.title_type is not null
group by td.title_type
order by mad_median;