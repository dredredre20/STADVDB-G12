import psycopg2
import os
from dotenv import load_dotenv
from sqlalchemy import create_engine

# Load environment variables from .env
load_dotenv()

# Get values
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_HOST = os.getenv("DB_HOST")
DB_PORT = os.getenv("DB_PORT")
SRC_DB = os.getenv("SRC_DB")
DW_DB = os.getenv("DW_DB")

# Establish source database connection
def get_src_connection():
    return psycopg2.connect(
        database = SRC_DB,
        user = DB_USER, 
        password = DB_PASSWORD,
        host = DB_HOST,
        port = DB_PORT
    )

# Establish data warehouse connection
def get_dw_connection():
    return psycopg2.connect(
        database = DW_DB,
        user = DB_USER, 
        password = DB_PASSWORD,
        host = DB_HOST,
        port = DB_PORT
    )


# New SQLAlchemy engine for src db
def get_src_engine():
    engine = create_engine(
        f'postgresql+psycopg2://postgres:silk-Song17@localhost:5432/IMDb-db' # replace passoword and database name accordingly
    )
    return engine

# New SQLAlchemy engine for the data warehouse
def get_dw_engine():
    engine = create_engine(
        f'postgresql+psycopg2://postgres:silk-Song17@localhost:5432/MCO_STADVDB' # replace password and database name accordingly
    )
    return engine