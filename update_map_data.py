import smartsheet
import json
import os
import subprocess

# Load token from .env file securely
env_path = os.path.join(os.path.dirname(__file__), ".env")
TOKEN = None
if os.path.exists(env_path):
    with open(env_path, "r") as f:
        for line in f:
            if line.startswith("SMARTSHEET_API_TOKEN="):
                TOKEN = line.strip().split("=")[1].strip()

if not TOKEN or TOKEN == "PEGUE_SU_NUEVO_TOKEN_AQUI":
    print("ERROR: Por favor ponga su nuevo token en el archivo .env")
    exit(1)
SHEET_ID = 9006720391008132

# Mapping for Sur Municipalities based on the red line in the provided image
SUR_MUNICIPALITIES = [
    "mayagüez", "mayaguez", "las marías", "las marias", "maricao", "hormigueros", "cabo rojo", 
    "san germán", "san german", "sabana grande", "lajas", "yauco", "guánica", "guanica",
    "guayanilla", "peñuelas", "penuelas", "adjuntas", "jayuya", "ponce", "orocovis", "villalba", 
    "juana díaz", "juana diaz", "coamo", "santa isabel", "barranquitas", "aibonito", "salinas", 
    "cayey", "guayama", "arroyo", "patillas", "yabucoa", "maunabo", "humacao", "vieques"
]

def get_region(municipality_name):
    if not municipality_name:
        return "Unknown"
    
    clean_name = str(municipality_name).lower().strip()
    
    # Check if the municipality is in the Sur list
    for sur_muni in SUR_MUNICIPALITIES:
        if clean_name == sur_muni or sur_muni in clean_name:
            return "South"
            
    return "North"

def main():
    print("Initializing Smartsheet client...")
    client = smartsheet.Smartsheet(TOKEN)
    client.errors_as_exceptions(True)

    print(f"Loading Sheet ID: {SHEET_ID}")
    sheet = client.Sheets.get_sheet(SHEET_ID)
    
    # Create column map
    col_map = {}
    for col in sheet.columns:
        col_map[col.title] = col.id
        
    print(f"Found {len(col_map)} columns in the sheet.")
    
    # Identify required columns
    req_columns = [
        "Case ID",
        "Municipality", 
        "Award Type Equivalent", 
        "Coordinates", 
        "Subcontractor Date of Notice to Proceed", 
        "Stage Status",
        "Subcontractor Name"
    ]
    
    # Some columns might have slightly different names, trying to handle that if needed, 
    # but based on the prompt, these are the exact names.
    missing = [c for c in req_columns if c not in col_map]
    if missing:
        print(f"WARNING: Could not find exact columns: {missing}. Please check exact spelling.")
        # Proceeding anyway as they might be mapped slightly differently, but we use what we have.

    cases = []
    
    # Excluded statuses
    excluded_statuses = [
        "00 - Reassigned",
        "16 - Inactive",
        "17 - Closed",
        "00 Assigned Offline",
        "15 - Construction Complete"
    ]

    print(f"Processing {len(sheet.rows)} rows...")
    
    for row in sheet.rows:
        row_dict = {}
        for cell in row.cells:
            # Map column ID back to Title
            title = next((t for t, i in col_map.items() if i == cell.column_id), None)
            if title:
                row_dict[title] = cell.display_value or cell.value

        # Filter logic
        ntp = row_dict.get("Subcontractor Date of Notice to Proceed")
        stage = str(row_dict.get("Stage Status", "")).strip()
        
        # 1. Must have Subcontractor Notice to Proceed
        if not ntp:
            continue
            
        # 2. Exclude specific stage statuses
        if any(ex_status in stage for ex_status in excluded_statuses):
            continue

        municipality = row_dict.get("Municipality", "")
        region = get_region(municipality)
        
        case_data = {
            "Case ID": row_dict.get("Case ID", ""),
            "Municipality": municipality,
            "Region": region,
            "Award Type Equivalent": row_dict.get("Award Type Equivalent", ""),
            "Coordinates": row_dict.get("Coordinates", ""),
            "Stage Status": stage,
            "Subcontractor Name": row_dict.get("Subcontractor Name", "") or row_dict.get("Subcontractor", "")
        }
        cases.append(case_data)

    print(f"Extracted {len(cases)} valid cases.")

    # Save to cases.json
    output_file = os.path.join(os.path.dirname(__file__), "cases.json")
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(cases, f, indent=4)
        
    print(f"Saved to {output_file}")
    
    # Commit and push to git
    try:
        print("Committing and pushing to GitHub...")
        cwd = os.path.dirname(__file__)
        subprocess.run(["git", "add", "cases.json"], cwd=cwd, check=True)
        # Check if there are changes to commit
        status = subprocess.run(["git", "status", "--porcelain"], cwd=cwd, capture_output=True, text=True)
        if status.stdout.strip():
            subprocess.run(["git", "commit", "-m", "Auto-update map cases data"], cwd=cwd, check=True)
            subprocess.run(["git", "push"], cwd=cwd, check=True)
            print("Successfully pushed to GitHub!")
        else:
            print("No changes to commit.")
    except Exception as e:
        print(f"Error during git operations: {e}")

if __name__ == "__main__":
    main()
