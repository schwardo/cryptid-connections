import csv
import itertools

# Define the attributes for each category based on DESIGN_NOTES.md
categories = {
    'head': ['bone', 'fin'],
    'eyes': ['beady', 'compound'],
    'mouth': ['fangs', 'beak'],
    'hands': ['webbed', 'claws'],
    'skin': ['fur', 'scales'],
    'tail': ['club', 'tentacles']
}

# The column names
columns = ['id'] + list(categories.keys())

# Get the lists of attributes in the correct order for itertools.product
attribute_lists = list(categories.values())

# Write exactly 64 combinations to cryptids.csv
with open('cryptids.csv', 'w', newline='') as f:
    writer = csv.writer(f)
    
    # Write the header row
    writer.writerow(columns)
    
    # Generate all combinations (2^6 = 64)
    for i, combination in enumerate(itertools.product(*attribute_lists)):
        # Format ID as a two-digit string (e.g. 00, 01, ..., 63)
        formatted_id = f"{i:02d}"
        row = [formatted_id] + list(combination)
        writer.writerow(row)

print("Successfully generated cryptids.csv with 64 cryptids.")
