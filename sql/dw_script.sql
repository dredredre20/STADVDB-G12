create table title_rating_fact(
	fact_id int not null,
	title_id varchar(10) not null, 
	average_rating decimal(10, 2), 
	num_votes int,
	primary key (fact_id), 
	foreign key (title_id) references title_information_dim(title_id)
	
);


create table title_information_dim(
	title_id varchar(10) not null, 
	title_type varchar(50), 
	primary_title varchar(50), 
	genre varchar(50)[], 
	start_year date,
	end_year date,
	parent_title_id varchar(10) not null, 
	season_num int, 
	episode_num int, 
	runtime_mins int,
	primary key (title_id),
	foreign key (parent_title_id) references title_information_dim(title_id)

);



create table title_crew_dim(
	crew_id int not null, 
	title_id varchar(10) not null, 
	name_id varchar(10) not null, 
	role_type varchar(50), 
	category enum_type,
	character_played varchar(50), 
	primary key (crew_id), 
	foreign key (title_id) references title_information_dim(title_id), 
	foreign key (name_id) references name_information_dim(name_id)
);


create type enum_type as enum ('director', 'writer', 'actor');

create table name_information_dim(
	name_id varchar(10) not null, 
	full_name varchar(50), 
	birth_year date, 
	death_year date, 
	primary_profession varchar(50)[], 
	known_titles varchar(50)[], 
	primary key (name_id)
);










