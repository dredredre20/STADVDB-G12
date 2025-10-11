from db_connection import get_src_connection
from db_connection import get_dw_connection

# Get connection
src_conn = get_src_connection()
dw_conn = get_dw_connection()

# Open cursor
src_cur = src_conn.cursor()
dw_cur = dw_conn.cursor()


# example query to test connection and fetch data
sql_context = """
    select *
    from title_ratings;
"""

src_cur.execute(sql_context)
record = src_cur.fetchone()
print(record)