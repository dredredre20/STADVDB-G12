import psycopg2
from sqlalchemy import create_engine

# Establish source database connection
def get_src_connection():
    return psycopg2.connect(
        database = "<src_dbName>", # replace with source db name
        user = "postgres", 
        password = "<password>",  # replace with your actual password
        host = "localhost",
        port = 5432
    )

# Establish data warehouse connection
def get_dw_connection():
    return psycopg2.connect(
        database = "warehouseName", # replace with local data warehouse name
        user = "postgres",
        password = "<password>", # replace with your actual password
        host = "localhost",
        port = 5432
    )


# New SQLAlchemy engine for src db
def get_src_engine():
    engine = create_engine(
        'postgresql+psycopg2://postgres:<password>@localhost:5432/<src_dbName>' # replace passoword and database name accordingly
    )
    return engine

# New SQLAlchemy engine for the data warehouse
def get_dw_engine():
    engine = create_engine(
        'postgresql+psycopg2://postgres:<password>@localhost:5432/<warehouseName>' # replace password and database name accordingly
    )
    return engine