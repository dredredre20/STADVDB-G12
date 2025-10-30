-- Cube Aggregation Table
-- Aggregation of the most used metrics across the OLAP query ideas
create materialized view ratings_cube as 
select
	gd.genre_name,
	tf.title_type,
	sum(dm.num_votes) as total_votes,
	ROUND(sum(dm.average_rating * dm.num_votes) / sum(dm.num_votes), 2) as avg_rating, 
	COUNT(distinct tf.title_id) as count_of_titles
from title_fact tf 
join rating_dim dm on dm.rating_id = tf.rating_id
join title_genre_bridge tgb on tgb.title_id = tf.title_id
join genre_dim gd on gd.genre_id = tgb.genre_id
where tf.title_name is not null and
		dm.num_votes is not null and
		dm.average_rating is not null and 
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
from ratings_cube rc 
join genre_dim gd on gd.genre_name = rc.genre_name 
join title_genre_bridge tgb on tgb.genre_id = gd.genre_id
join title_fact tf on tf.title_id = tgb.title_id
join rating_dim rd on rd.rating_id = tf.rating_id 
where rc.genre_name = 'Drama' 
	and rc.title_type = 'movie'
	and rc.title_type = tf.title_type 
order by rd.average_rating desc
limit 200;
	


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
-- No clue bruh




