import re
import sys
from collections import defaultdict, Counter
import sqlparse

def detect_purpose(context):
    context = context.lower()
    if any(k in context for k in [" join ", " on "]):
        return "join"
    elif any(k in context for k in [" where ", " having "]):
        return "filter"
    elif any(k in context for k in [" group by ", " partition by "]):
        return "group"
    elif any(k in context for k in [" sum(", " avg(", " count(", " max(", " min("]):
        return "aggregate"
    else:
        return "project"

def analyze_sql(sql_text):
    statements = [s.strip() for s in sqlparse.split(sql_text) if s.strip()]
    table_usage = Counter()
    column_usage = defaultdict(lambda: Counter())
    column_purpose = defaultdict(lambda: defaultdict(set))

    # Regex patterns
    table_alias_pattern = re.compile(
        r'\b(from|join)\s+([a-zA-Z0-9_\.]+)\s+(as\s+)?([a-zA-Z0-9_]+)?', re.IGNORECASE
    )
    column_pattern = re.compile(r'([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)')

    for stmt in statements:
        context = " " + stmt + " "
        alias_map = {}

        # --- Detect tables and aliases ---
        for match in table_alias_pattern.findall(stmt):
            _, table_name, _, alias = match
            alias = alias.strip() if alias else table_name
            alias_map[alias] = table_name
            table_usage[table_name] += 1

        # --- Detect columns ---
        for alias, col in column_pattern.findall(stmt):
            base_table = alias_map.get(alias, alias)
            column_usage[base_table][col] += 1
            purpose = detect_purpose(context)
            column_purpose[base_table][col].add(purpose)

    # --- Build report ---
    report = []
    for table, count in sorted(table_usage.items(), key=lambda x: x[1], reverse=True):
        columns_info = []
        for col, freq in sorted(column_usage[table].items(), key=lambda x: x[1], reverse=True):
            purposes = sorted(list(column_purpose[table][col]))
            columns_info.append({
                "column_name": col,
                "appearances": freq,
                "purposes": purposes
            })
        report.append({
            "table_name": table,
            "total_usage": count,
            "columns": columns_info
        })
    return report

def print_yaml(report):
    for tbl in report:
        print(f"- table_name: {tbl['table_name']}")
        print(f"  total_usage: {tbl['total_usage']}")
        print("  columns:")
        if not tbl["columns"]:
            print("    []")
        for col in tbl["columns"]:
            purposes = ", ".join(col["purposes"])
            print(f"    - column_name: {col['column_name']}")
            print(f"      appearances: {col['appearances']}")
            print(f"      purposes: [{purposes}]")
        print()

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python sql_usage_report_v2.py <file.sql>")
        sys.exit(1)

    sql_file = sys.argv[1]
    with open(sql_file, "r", encoding="utf-8") as f:
        sql_text = f.read()

    report = analyze_sql(sql_text)
    print_yaml(report)
