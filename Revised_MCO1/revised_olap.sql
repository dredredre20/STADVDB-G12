-- Cube Aggregation Table
-- Aggregation of the most used metrics across the OLAP query ideas
create materialized view ratings_cube as 
select
	gd.genre_name,
	tf.title_type,
	sum(rd.num_votes) as total_votes,
	ROUND(sum(rd.average_rating * rd.num_votes) / sum(rd.num_votes), 2) as avg_rating, 
	COUNT(distinct tf.title_id) as count_of_titles
from title_fact tf 
join rating_dim rd on rd.rating_id = tf.rating_id
join title_genre_bridge tgb on tgb.title_id = tf.title_id
join genre_dim gd on gd.genre_id = tgb.genre_id
where tf.title_name is not null and
		rd.num_votes is not null and
		rd.average_rating is not null and 
		tf.title_type is not null
group by cube (gd.genre_name, tf.title_type)
order by gd.genre_name;
-- REFRESH MATERIALIZED VIEW ratings_cube;

-- Enhancement: handle division by zero and nulls for grouping sets
create materialized view ratings_cube as 
select
	COALESCE(gd.genre_name, 'ALL GENRES') AS genre_name,
  COALESCE(tf.title_type, 'ALL TYPES') AS title_type,
	sum(rd.num_votes) as total_votes,
	ROUND(
    CASE WHEN sum(rd.num_votes) = 0 THEN NULL
         ELSE sum(rd.average_rating * rd.num_votes) / sum(rd.num_votes)
    END, 2
  ) as avg_rating, 
	COUNT(distinct tf.title_id) as count_of_titles
from title_fact tf 
join rating_dim rd on rd.rating_id = tf.rating_id
join title_genre_bridge tgb on tgb.title_id = tf.title_id
join genre_dim gd on gd.genre_id = tgb.genre_id
where tf.title_name is not null and
		rd.num_votes is not null and
		rd.average_rating is not null and 
		tf.title_type is not null
group by cube (gd.genre_name, tf.title_type)
order by gd.genre_name;

--==========================================================================

-- Slice 
-- Focusing on a single dimension from the table
-- Uses drama since it has the highest number of titles
select *
from ratings_cube
where genre_name = 'Drama' and title_type is not null
order by avg_rating desc;

--==========================================================================

-- Dice 
-- More filtering done
select *
from ratings_cube 
where 
	genre_name in ('Drama', 'Comedy', 'Talk-Show') and
	title_type in ('tvEpisode', 'short', 'movie')
order by avg_rating desc;

-- Conditions were chosen base on the highest counts of genres and title types
select title_type, count(title_id) 
from title_fact
group by title_type
order by count(title_id) DESC;

select gd.genre_name, count(tf.title_id) 
from title_fact tf
join title_genre_bridge tgb on tgb.title_id = tf.title_id
join genre_dim gd on gd.genre_id = tgb.genre_id  
group by gd.genre_name
order by count(tf.title_id) DESC;


--==========================================================================

-- Drill-Down
-- Not even sure about this one ngl, seems like a dice operation
-- We could just rework the old sql for drill down
select 
  tf.title_id,
  tf.title_name,
  rd.num_votes    AS title_votes,
  rd.average_rating AS title_avg_rating
from ratings_cube rc -- i think we don't have to use the cube for this one
join genre_dim gd on gd.genre_name = rc.genre_name 
join title_genre_bridge tgb on tgb.genre_id = gd.genre_id
join title_fact tf on tf.title_id = tgb.title_id
join rating_dim rd on rd.rating_id = tf.rating_id 
where rc.genre_name = 'Drama' 
	and rc.title_type = 'movie'
	and rc.title_type = tf.title_type 
order by rd.average_rating desc
limit 200;

-- Revised version without using cube and using partitioning to rank
SELECT *
FROM (
    SELECT  
        gd.genre_name,
        tf.title_type,
        tf.title_name,
        rd.average_rating,
        rd.num_votes,
        ROW_NUMBER() OVER (PARTITION BY gd.genre_name, tf.title_type ORDER BY rd.average_rating DESC) AS rank
    FROM title_fact tf
    JOIN rating_dim rd ON rd.rating_id = tf.rating_id
    JOIN title_genre_bridge tgb ON tgb.title_id = tf.title_id
    JOIN genre_dim gd ON gd.genre_id = tgb.genre_id
) ranked
WHERE gd.genre_name = 'Drama'
  AND tf.title_type = 'movie'
  AND rank <= 5;
ORDER BY rd.average_rating DESC;

-- We can also just stick with original query
-- By rating
WITH ranked_titles_by_rating AS (
        SELECT  gd.genre_name,
                tf.title_name,
                rd.average_rating,
                ROW_NUMBER() OVER (PARTITION BY genre_name ORDER BY rd.average_rating DESC) AS title_ranking,
                rd.num_votes
        FROM genre_dim gd
        JOIN title_genre_bridge tgb ON gd.genre_id = tgb.genre_id 
        join title_fact tf on tf.title_id = tgb.title_id
        join rating_dim rd on rd.rating_id = tf.rating_id
        WHERE title_type = 'movie'
            AND num_votes > 100
    )
    SELECT  rtbp.genre_name,
            rtbp.title_name,
            rtbp.average_rating,
            rtbp.num_votes
    FROM ranked_titles_by_rating rtbp
    WHERE title_ranking <= 3;

-- By popularity
WITH ranked_titles_by_popularity AS (
        SELECT  gd.genre_name,
                tf.title_name,
                rd.num_votes,
                ROW_NUMBER() OVER (PARTITION BY genre_name ORDER BY rd.num_votes DESC) AS title_ranking,
                rd.average_rating
        FROM genre_dim gd
        JOIN title_genre_bridge tgb ON gd.genre_id = tgb.genre_id 
        join title_fact tf on tf.title_id = tgb.title_id
        join rating_dim rd on rd.rating_id = tf.rating_id
    )
    SELECT  rtbp.genre_name,
            rtbp.title_name,
            rtbp.num_votes,
            rtbp.average_rating
    FROM ranked_titles_by_popularity rtbp
    WHERE title_ranking <= 3;

--==========================================================================

-- Pivot
-- Display average ratings for 'movie', 'short', and 'tvEpisode' as separate columns
-- More things can be added here 
SELECT
  genre_name,
  ROUND(MAX(CASE WHEN title_type='movie'    THEN avg_rating END), 2) AS avg_rating_movie,
  ROUND(MAX(CASE WHEN title_type='short'    THEN avg_rating END), 2) AS avg_rating_short,
  ROUND(MAX(CASE WHEN title_type='tvEpisode' THEN avg_rating END), 2) AS avg_rating_tvEpisode
FROM ratings_cube
WHERE genre_name IS NOT NULL AND title_type IS NOT NULL
GROUP BY genre_name
ORDER BY genre_name;

--==========================================================================

-- Roll-up
-- I just reused the cube query, but I used ROLLUP function instead
select
	gd.genre_name,
	tf.title_type,
	sum(rd.num_votes) as total_votes,
	ROUND(sum(rd.average_rating * rd.num_votes) / sum(rd.num_votes), 2) as avg_rating, 
	COUNT(distinct tf.title_id) as count_of_titles
from title_fact tf 
join rating_dim rd on rd.rating_id = tf.rating_id
join title_genre_bridge tgb on tgb.title_id = tf.title_id
join genre_dim gd on gd.genre_id = tgb.genre_id
where tf.title_name is not null and
		rd.num_votes is not null and
		rd.average_rating is not null and 
		tf.title_type is not null
group by rollup (gd.genre_name, tf.title_type)
order by gd.genre_name;

-- We can also just use our original query with a few revisions, also using ROLLUP
-- By rating
SELECT  
  gd.genre_name,
  tf.title_type,
  ROUND(AVG(rd.average_rating), 3) AS average_rating_per_level
FROM title_fact tf 
JOIN rating_dim rd ON tf.rating_id = rd.rating_id  
JOIN title_genre_bridge tgb ON tf.title_id = tgb.title_id  
JOIN genre_dim gd ON tgb.genre_id = gd.genre_id  
GROUP BY ROLLUP (gd.genre_name, tf.title_type)
ORDER BY gd.genre_name, tf.title_type;

-- By popularity
SELECT  
  gd.genre_name,
  tf.title_type,
  SUM(rd.num_votes) AS num_votes_per_level
FROM title_fact tf 
JOIN rating_dim rd ON tf.rating_id = rd.rating_id  
JOIN title_genre_bridge tgb ON tf.title_id = tgb.title_id  
JOIN genre_dim gd ON tgb.genre_id = gd.genre_id  
GROUP BY ROLLUP (gd.genre_name, tf.title_type)
ORDER BY gd.genre_name, tf.title_type;

