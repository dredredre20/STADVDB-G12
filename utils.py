#Python file for utility/helper functions
from IPython.display import HTML

def display_results(dataframe):
    return HTML(f"""
        <div style="height:400px; overflow-y:auto; border:1px; padding:10px; background-color:clear;">
        {dataframe.to_html(index=False)}
        </div>
        """)