CREATE TYPE film_role AS ENUM (
    'actor',
    'actress',
    'archive_footage',
    'archive_sound',
    'casting_director',
    'cinematographer',
    'composer',
    'director',
    'editor',
    'producer',
    'production_designer',
    'self',
    'writer'
);

CREATE TABLE title_fact (
    title_id VARCHAR(10) NOT NULL,
    title_name TEXT,
    title_type TEXT,
    runtime_mins INT,
    start_year DATE,
    end_year DATE,
    is_adult BOOLEAN,
    parent_title_id VARCHAR(10),
    season_num INT,
    episode_num INT,
    rating_id INT,
    PRIMARY KEY (title_id),
    FOREIGN KEY (parent_title_id) REFERENCES title_fact(title_id),
    FOREIGN KEY (rating_id) REFERENCES rating_dim(rating_id)
);

CREATE TABLE crew_dim(
    crew_id varchar(10) NOT NULL, 
    primary_name text, 
    birth_year int,
    death_year int, 
    primary key (crew_id)
);

CREATE TABLE genre_dim(
    genre_id int NOT NULL,
    genre_name text,
    primary key (genre_id)
);

CREATE TABLE rating_dim (
    rating_id INT NOT NULL,
    average_rating DECIMAL(10, 2),
    num_votes INT,
    PRIMARY KEY (rating_id)
);


CREATE TABLE title_crew_bridge(
    title_id varchar(10) NOT NULL, 
    crew_id varchar(10) NOT NULL, 
    job_category film_role, 
    FOREIGN KEY (title_id) references title_fact(title_id), 
    FOREIGN KEY (crew_id) REFERENCES crew_dim(crew_id)
);

CREATE TABLE title_genre_dim(
    title_id varchar(10) NOT NULL, 
    genre_name varchar (20) NOT NULL, 
    FOREIGN KEY (title_id) REFERENCES title_fact(title_id)
);  



drop table genre_dim cascade;
drop table title_genre_bridge cascade;
drop table crew_dim cascade;
drop table title_crew_bridge cascade;
drop table title_fact cascade;
drop table title_fact cascade;
drop type film_role cascade;

DROP TABLE IF EXISTS title_akas CASCADE;
DROP TABLE IF EXISTS title_basics CASCADE;
DROP TABLE IF EXISTS title_crew CASCADE;
DROP TABLE IF EXISTS title_crew_bridge CASCADE;
DROP TABLE IF EXISTS title_episode CASCADE;
 DROP TABLE IF EXISTS title_fact CASCADE;
 DROP TABLE IF EXISTS title_genre_bridge CASCADE;
 DROP TABLE IF EXISTS title_genre_dim CASCADE;
 DROP TABLE IF EXISTS title_principals CASCADE;
 DROP TABLE IF EXISTS title_ratings CASCADE;




