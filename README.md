# STADVDB-G12
Advanced Database Systems Repository

## Steps to Perform ETL

1. **Create the Data Warehouse Tables**
   - Open the `schema/create_dw_tables.sql` file.
   - Execute the SQL statements sequentially to create all dimension, bridge, and fact tables.

2. **Run the ETL Scripts**
   - Navigate to the `etl` folder.
   - Execute the scripts in this order:
     1. **Dimension Tables** 
     2. **Bridge Tables** 
     3. **Fact Tables** 

>  This order ensures referential integrity — dimensions are loaded first, followed by bridge and fact tables that depend on them.

### Link to the google drive:
- https://drive.google.com/drive/folders/1ytW-lEq-mltdLuOGlRZpMbgPrdtISLFl?usp=sharing
