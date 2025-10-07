import pandas as pd

# Extraction: Read TSV Files

name_info_df = pd.read_csv("./tsv_files/name.basics.tsv", sep='\t')
title_info_df = pd.read_csv("./tsv_files/title.basics.tsv", sep='\t')
title_crew_df = pd.read_csv("./tsv_files/title.crew.tsv", sep='\t')
title_principals_df = pd.read_csv("./tsv_files/title.principals.tsv", sep='\t')
title_ratings_df = pd.read_csv("./tsv_files/title.ratings.tsv", sep='\t')
title_episode_df = pd.read_csv("./tsv_files/title.episode.tsv", sep='\t')
# title_akas_df = pd.read_csv('', sep='\t') this was not used in the design so comment out first

# Transformation: Clean and Prepare Data