-- Extract, transform, and load title_crew_bridge
INSERT INTO title_crew_bridge(title_id, crew_id, job_category)
WITH cleaned_title_crew AS (
    SELECT DISTINCT
        tp.tconst,
        tp.nconst,
		  CASE
	    	WHEN tp.category IN ('actor','actress','archive_footage','archive_sound','casting_director',
	                         'cinematographer','composer','director','editor','producer',
	                         'production_designer','self','writer')
	    	THEN tp.category::film_role
	   	 	ELSE NULL
	  		END AS job_category
  	FROM title_principals tp
    where tp.tconst is not null and
    		tp.nconst IS NOT null
)
SELECT *
FROM cleaned_title_crew
WHERE tconst is not null and nconst is not null;