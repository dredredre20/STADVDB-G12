import pandas as pd
import numpy as np

from etl.extract import (
    extract_ratings,
    extract_title, 
    extract_crew,
    extract_title_crew,
    extract_genre,
    extract_title_genre
)

def transform_ratings():

    # Transform to dataframe
    ratings_df = extract_ratings()

    # Drop duplicates and NaN values
    ratings_df = ratings_df.drop_duplicates(subset=['tconst'])
    ratings_df = ratings_df.dropna(subset=['tconst'])

    # Ensure proper data types
    ratings_df['averageRating'] = pd.to_numeric(ratings_df['averageRating'], errors='coerce')
    ratings_df['numVotes'] = pd.to_numeric(ratings_df['numVotes'], errors='coerce')



    # Remove values with invalid ratings and number of votes
    ratings_df = ratings_df[(ratings_df['averageRating'] >= 0.0) & (ratings_df['averageRating'] <= 10.0)]
    ratings_df = ratings_df[ratings_df['numVotes'] >= 0]

    return ratings_df


def transform_title():
    # Transform to dataframe
    title_df = extract_title()

    # Drop duplicates and NaN values
    title_df = title_df.drop_duplicates(subset=['tconst', ''])
    title_df = title_df.dropna(subset=['tconst', 'titleType', 'primaryTitle'], how='all')

    # Fill missing values with appropriate defaults
    title_df['originalTitle'] = title_df['originalTitle'].fillna(title_df['primaryTitle'])
    title_df['genres'] = title_df['genres'].fillna('Unknown')

    # Ensure proper data types
    title_df['startYear'] = pd.to_numeric(title_df['startYear'], errors='coerce')
    title_df['endYear'] = pd.to_numeric(title_df['endYear'], errors='coerce')
    title_df['runtimeMinutes'] = pd.to_numeric(title_df['runtimeMinutes'], errors='coerce') 

    return title_df

def transform_crew():
    # Transform to dataframe
    crew_df = extract_crew()

    # Drop dublicates and NaN values
    crew_df = crew_df.drop_duplicates(subset=['nconst'])
    crew_df = crew_df.dropna(subset=['nconst', 'primaryname'], how='any')

    # I mean crew member without category is an extra 
    crew_df['category'] = crew_df['category'].fillna('extra') 

    # Clean up text fields and lowercase
    # crew_df['category'] = crew_df['category'].str.lower().str.strip()

    # Remove invalid birthyear and deathyear
    # I don't think we need people that lived during old times, seems useless for analysis
    birth_year_invalid = crew_df['birthyear'] > 2025 | crew_df['birthyear'] < 1600 
    death_year_invalid = crew_df['deathyear'] > 2025 | crew_df['deathyear'] < 1600
    
    crew_df.loc[birth_year_invalid, 'birthyear'] = np.nan
    crew_df.loc[death_year_invalid, 'deathyear'] = np.nan

    return crew_df

def transform_genre():
    # Transform to dataframe
    genre_df = extract_genre()

    # Drop duplicates and empty genres
    genre_df = genre_df[genre_df['genre'].notna()]
    genre_df = genre_df[genre_df['genre'].str.strip() != '']

    # Clean up text fields and lowercase
    genre_df['genre'] = genre_df['genre'].str.strip().str.lower()

    # Reassign genre_id after dropping duplicates
    genre_df = genre_df.drop_duplicates(subset=['genre']).reset_index(drop=True)
    genre_df['genre_id'] = range(1, len(genre_df) + 1)

    return genre_df

def transform_bridge_title_crew():
    # Transform to dataframe
    title_crew_df = extract_title_crew()

    # Drop duplicates and NaN values
    title_crew_df = title_crew_df.drop_duplicates(subset=['tconst', 'nconst'])
    title_crew_df = title_crew_df.dropna(subset=['tconst', 'nconst'], how='any')

    return title_crew_df

def transform_bridge_title_genre():
    # Transform to dataframes
    title_genre_df = extract_title_genre()
    genre_df = transform_genre()

    # Clean up text fields and lowercase
    title_genre_df['genres'] = title_genre_df['genres'].str.strip().str.lower()

    # Merge the two dataframes to get the genre_id
    title_genre_df = title_genre_df.merge(genre_df, left_on='genres', right_on='genre', how='inner')

    # Keep only necessary columns
    title_genre_df = title_genre_df[['tconst', 'genre_id']]

    # Drop duplicates and NaN values
    title_genre_df = title_genre_df.drop_duplicates(subset=['tconst', 'genre_id']).reset_index(drop=True)
    title_genre_df = title_genre_df.dropna(subset=['tconst', 'genre_id'], how='any')

    return title_genre_df

def transform_all():

    # Dictionary to hold all transformations
    transformations = {
        'ratings':transform_ratings(),
        'title' : transform_title(),
        'crew' : transform_crew(),
        'genre' : transform_genre(),
        'bridge_title_crew' : transform_bridge_title_crew(),
        'bridge_title_genre' : transform_bridge_title_genre()
    }

    for name, df in transformations.items():
        print(f"{name}: {len(df)} rows, {len(df.columns)} columns")

    return transformations



if __name__ == "__main__":
    # Test transformations
    transformed_data = transform_all()


