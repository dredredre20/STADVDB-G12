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

CREATE TABLE title_dim(
    title_id varchar(10) not null, 
    title_name text, 
    title_type text,
    runtime_mins int,
    start_year date,
    is_adult boolean,
    parent_title_id varchar(10), 
    season_num int, 
    episode_num int, 
    end_year date,
    primary key (title_id),
    foreign key (parent_title_id) references title_dim(title_id)
);

CREATE TABLE crew_dim(
    crew_id varchar(10) NOT NULL, 
    job_category film_role, 
    primary_name text, 
    birth_year date,
    death_year date, 
    primary key (crew_id)
);

CREATE TABLE genre_dim(
    genre_id int NOT NULL,
    genre_name text,
    primary key (genre_id)
);

CREATE TABLE rating_fact(
    rating_id int not null,
    title_id varchar(10) not null, 
    average_rating decimal(10, 2), 
    num_votes int,
    primary key (rating_id), 
    FOREIGN KEY (title_id) REFERENCES title_dim(title_id)
);

CREATE TABLE title_crew_bridge(
    title_id varchar(10) NOT NULL, 
    crew_id varchar(10) NOT NULL, 
    FOREIGN KEY (title_id) references title_dim(title_id), 
    FOREIGN KEY (crew_id) REFERENCES crew_dim(crew_id)
);

CREATE TABLE title_genre_bridge(
    title_id varchar(10) NOT NULL, 
    genre_id int NOT NULL, 
    FOREIGN KEY (title_id) REFERENCES title_dim(title_id),
    FOREIGN KEY (genre_id) REFERENCES genre_dim(genre_id)
);  




drop table genre_dim cascade;
drop table title_genre_bridge cascade;
drop table crew_dim cascade;
drop table title_crew_bridge cascade;
drop table title_dim cascade;
drop table rating_fact cascade;
drop type film_role cascade;





