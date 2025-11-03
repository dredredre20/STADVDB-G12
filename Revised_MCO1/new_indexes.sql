-- For the ratings_cube materialized view creation (your slowest query)

-- 1. Primary JOIN keys
CREATE INDEX idx_rating_dim_rating_id ON rating_dim(rating_id);
CREATE INDEX idx_title_fact_rating_id ON title_fact(rating_id);
CREATE INDEX idx_title_fact_title_id ON title_fact(title_id);

-- 2. Bridge table - composite index for both join directions
CREATE INDEX idx_title_genre_bridge_title_genre ON title_genre_bridge(title_id, genre_id);

-- 3. Genre dimension
CREATE INDEX idx_genre_dim_genre_id ON genre_dim(genre_id);

-- 4. Filtering columns (for WHERE clause in cube query)
CREATE INDEX idx_title_fact_filters ON title_fact(title_type, title_name) WHERE title_name IS NOT NULL AND title_type IS NOT NULL;
CREATE INDEX idx_rating_dim_filters ON rating_dim(num_votes, average_rating) WHERE num_votes IS NOT NULL AND average_rating IS NOT NULL;