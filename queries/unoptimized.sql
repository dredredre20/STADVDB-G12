-- [GROUP BY] --
-- Which directors have the highest average rating across all their titles?
select c.primary_name as director_name, ROUND(AVG(r.average_rating), 2) as avg_rating, COUNT(t.title_id) as num_titles
from crew_dim c
join title_crew_bridge tcb on c.crew_id = tcb.crew_id and tcb.job_category = 'director'
join rating_fact r on tcb.title_id = r.title_id
join title_dim t on r.title_id = t.title_id
where tc.job_category = 'director'
group by c.primary_name
order by avg_rating directors
limit 10;

-- [ROLLUP] --
-- What’s the consistent rating for each director and writer combined?
-- What’s the average rating for each genre and title type (movie, series, short)?
select g.genre_name, t.title_type, ROUND(AVG(r.average_rating), 2) as avg_rating,
from rating_fact r
join title_dim t on r.title_id = t.title_id 
join title_genre_bridge tgb on t.title_id = tgb.title_id
join genre_dim g on tgb.genre_id = g.genre_id 

group by rollup (g.genre_name, t.title_type)
order by g.genre_name, t.title_type;

-- [DRILL-DOWN] --
-- What’s the average rating of a series for each season?
-- What are the most voted (popular) titles for each year?
-- What are the highest-rated titles for each title type?

-- [CUBE] --
-- Compare how many votes adult vs. non-adult titles have in each genre

-- [SLICE AND DICE] --
-- What are the top-rated titles for each genre?

-- [SLICE + DRILL-DOWN] -- 
-- Which actors or actresses are associated with the highest-rated titles?

-- [STATISTICAL ANALYSIS - CORRELATION] --
-- Do longer runtimes affect the rating and number of votes from each user?
-- runtime_mins vs average_rating
select (AVG(r.average_rating) * AVG(t.runtime_mins) - AVG(r.average_rating * t.runtime_mins)) / 
       (STDDEV_POP(r.average_rating) * STDDEV_POP(t.runtime_mins)) as pearson_correlation
from rating_fact r
join title_dim t on r.title_id = t.title_id
where t.runtime_mins is not null and r.average_rating is not null;

-- runtime_mins vs num_votes
select (AVG(r.num_votes) * AVG(t.runtime_mins) - AVG(r.num_votes * t.runtime_mins)) / 
       (STDDEV_POP(r.num_votes) * STDDEV_POP(t.runtime_mins)) as pearson_correlation
from rating_fact r
join title_dim t on r.title_id = t.title_id
where t.runtime_mins is not null and r.num_votes is not null;

-- [STATISTICAL ANALYSIS - AGGREGATION + CORRELATION] --
-- Does the number of titles under each director and writer affect the quality of their work (via rating)?