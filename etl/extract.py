from etl.db_connection import get_src_connection, get_src_engine
import pandas as pd

src_conn = get_src_connection()
engine = get_src_engine()


def extract_ratings():
    ratings_df =  pd.read_sql_query(f"SELECT * FROM title_ratings", engine)
    return ratings_df

def extract_title():
    title_df = pd.read_sql_query(f"SELECT * FROM title_basics tb LEFT JOIN title_episode te ON tb.tconst  = te.tconst", engine)
    return title_df

def extract_crew():
    crew_df = pd.read_sql_query(f"SELECT tp.nconst, category, primaryname, birthyear, deathyear FROM title_principals tp  JOIN name_basics nb ON tp.nconst  = nb.nconst", engine)
    return crew_df

def extract_title_crew():
    title_crew_df = pd.read_sql_query(f"SELECT tb.tconst, nconst FROM title_basics tb JOIN title_principals tp ON tb.tconst = tp.tconst", engine)
    return title_crew_df

def extract_genre():
    genre_df = pd.read_sql_query(f"SELECT genres FROM title_basics tb", engine)

    genre_df = genre_df.assign(genres = genre_df['genres'].str.split(',')).explode('genres')

    genre_df = genre_df.drop_duplicates(subset=['genres']).reset_index(drop=True)

    genre_df = genre_df.rename(columns = {'genres': 'genre'})

    genre_df['genre_id'] = genre_df.index + 1

    genre_df = genre_df[['genre_id', 'genre']]

    return genre_df
    
def extract_title_genre():
    title_genre_df = pd.read_sql_query("SELECT tconst, genres FROM title_basics tb", engine)

    title_genre_df = title_genre_df[title_genre_df['genres'].notna()]

    title_genre_df = title_genre_df.assign(genres = title_genre_df['genres'].str.split(',')).explode('genres')
    
    title_genre_df = title_genre_df.drop_duplicates(subset=['tconst', 'genres']).reset_index(drop=True)

    return title_genre_df

