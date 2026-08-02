import os
import pandas as pd
from flask import Flask, jsonify, request, send_from_directory
from rdkit import Chem
from rdkit.Chem import Descriptors, Crippen, rdMolDescriptors
from rdkit.Chem.Draw import rdMolDraw2D

app = Flask(__name__, static_folder='../frontend', static_url_path='')

# File paths (resolved relative to this file's directory, robust for Jupyter and script modes)
try:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
except NameError:
    BASE_DIR = os.getcwd()

TOP_100_CSV_PATH = os.path.join(BASE_DIR, '../../candidate_screening_output/top_100_candidates_cns_mpo.csv')
SHORTLIST_CSV_PATH = os.path.join(BASE_DIR, '../../candidate_screening_output/top_10_shortlist.csv')

# Dynamic SVG generator function
def smiles_to_svg(smiles, width=220, height=220):
    try:
        mol = Chem.MolFromSmiles(smiles)
        if mol is None:
            return ""
        
        # Standardize molecule representation
        Chem.rdDepictor.Compute2DCoords(mol)
        
        # Draw molecule to SVG
        drawer = rdMolDraw2D.MolDraw2DSVG(width, height)
        opts = drawer.drawOptions()
        
        # Transparent background for glassmorphism
        opts.backgroundColour = (0, 0, 0, 0)
        
        # Standard symbol/bond color: off-white for dark mode
        opts.symbolColour = (0.9, 0.9, 0.9, 1.0)
        
        # Optimize atom colors for dark mode (bright/neon tones on transparent background)
        opts.updateAtomPalette({
            6: (0.9, 0.9, 0.9, 1.0),   # Carbon: light grey
            7: (0.4, 0.7, 1.0, 1.0),   # Nitrogen: light blue
            8: (1.0, 0.4, 0.4, 1.0),   # Oxygen: light red
            9: (0.4, 0.9, 0.4, 1.0),   # Fluorine: light green
            15: (1.0, 0.6, 0.2, 1.0),  # Phosphorus: orange
            16: (0.9, 0.8, 0.2, 1.0),  # Sulfur: yellow
            17: (0.4, 0.9, 0.4, 1.0),  # Chlorine: light green
            35: (0.8, 0.5, 0.2, 1.0),  # Bromine: brown
            53: (0.7, 0.4, 0.9, 1.0)   # Iodine: purple
        })
        
        drawer.DrawMolecule(mol)
        drawer.FinishDrawing()
        return drawer.GetDrawingText()
    except Exception as e:
        return f"<!-- SVG Error: {str(e)} -->"

# Desirability scoring math (reverse-engineered from top_100_candidates_cns_mpo.csv)
def calculate_desirabilities(clogp, clogd, mw, tpsa, hbd):
    # d_clogp
    d_clogp = 1.0 if clogp <= 3.0 else max(0.0, 1.0 - 0.5 * (clogp - 3.0))
    
    # d_clogd (clogd is approximated by clogp)
    d_clogd = 1.0 if clogd <= 2.0 else max(0.0, 1.0 - 0.5 * (clogd - 2.0))
    
    # d_mw
    d_mw = 1.0 if mw <= 360.0 else max(0.0, 1.0 - (mw - 360.0) / 140.0)
    
    # d_tpsa
    if tpsa < 20.0:
        d_tpsa = 0.0
    elif tpsa < 40.0:
        d_tpsa = (tpsa - 20.0) / 20.0
    elif tpsa <= 90.0:
        d_tpsa = 1.0
    else:
        d_tpsa = max(0.0, 1.0 - (tpsa - 90.0) / 30.0)
        
    # d_hbd
    d_hbd = max(0.0, 1.0 - 0.29 * hbd)
    
    # MPO score is the sum of these 5 components (ranges from 0.0 to 5.0)
    cns_mpo_score = d_clogp + d_clogd + d_mw + d_tpsa + d_hbd
    
    return {
        "d_clogp": round(d_clogp, 3),
        "d_clogd": round(d_clogd, 3),
        "d_mw": round(d_mw, 3),
        "d_tpsa": round(d_tpsa, 3),
        "d_hbd": round(d_hbd, 3),
        "cns_mpo_score": round(cns_mpo_score, 3)
    }

# Cache containers for candidates datasets
candidate_cache = {
    "top100": [],
    "shortlist": []
}

def load_and_cache_datasets():
    print("Pre-loading datasets and caching RDKit SVG drawings...")
    
    # Load Top 100
    if os.path.exists(TOP_100_CSV_PATH):
        df_100 = pd.read_csv(TOP_100_CSV_PATH)
        for _, row in df_100.iterrows():
            item = row.to_dict()
            # Generate RDKit SVG
            item["svg"] = smiles_to_svg(row["smiles"])
            item["novel_vs_training"] = str(row["novel_vs_training"]).lower() == 'true'
            candidate_cache["top100"].append(item)
        print(f"Loaded {len(candidate_cache['top100'])} candidates into Top 100 cache.")
    else:
        print(f"WARNING: Top 100 CSV not found at {TOP_100_CSV_PATH}")

    # Load Shortlist
    if os.path.exists(SHORTLIST_CSV_PATH):
        df_short = pd.read_csv(SHORTLIST_CSV_PATH)
        for _, row in df_short.iterrows():
            item = row.to_dict()
            item["svg"] = smiles_to_svg(row["smiles"])
            item["novel_vs_training"] = str(row["novel_vs_training"]).lower() == 'true'
            candidate_cache["shortlist"].append(item)
        print(f"Loaded {len(candidate_cache['shortlist'])} candidates into Shortlist cache.")
    else:
        print(f"WARNING: Shortlist CSV not found at {SHORTLIST_CSV_PATH}")

# Serve Frontend
@app.route('/')
def serve_index():
    return send_from_directory(app.static_folder, 'index.html')

# API Route: Get candidates
@app.route('/api/candidates', methods=['GET'])
def get_candidates():
    dataset = request.args.get('dataset', 'top100')
    if dataset not in candidate_cache:
        return jsonify({"error": "Invalid dataset. Choose 'top100' or 'shortlist'."}), 400
    return jsonify(candidate_cache[dataset])

# API Route: Calculate custom SMILES properties and MPO scores
@app.route('/api/calculate', methods=['POST'])
def calculate_molecule():
    data = request.get_json()
    if not data or 'smiles' not in data:
        return jsonify({"error": "SMILES string is required."}), 400
    
    smiles = data['smiles'].strip()
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        return jsonify({"error": "Invalid SMILES string. Could not parse molecule."}), 400
        
    try:
        # Calculate chemical properties using RDKit
        mw = round(Descriptors.MolWt(mol), 2)
        clogp = round(Crippen.MolLogP(mol), 2)
        tpsa = round(rdMolDescriptors.CalcTPSA(mol), 2)
        hbd = int(rdMolDescriptors.CalcNumHBD(mol))
        hba = int(rdMolDescriptors.CalcNumHBA(mol))
        formula = rdMolDescriptors.CalcMolFormula(mol)
        
        # Calculate desirability scores
        scores = calculate_desirabilities(clogp, clogp, mw, tpsa, hbd)
        
        # Generate SVG
        svg = smiles_to_svg(smiles, width=300, height=300)
        
        result = {
            "smiles": smiles,
            "formula": formula,
            "mol_weight": mw,
            "clogp": clogp,
            "tpsa": tpsa,
            "hbd": hbd,
            "hba": hba,
            "svg": svg,
            **scores
        }
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": f"Error calculating properties: {str(e)}"}), 500

if __name__ == '__main__':
    load_and_cache_datasets()
    # Run server locally on port 5000
    app.run(host='127.0.0.1', port=5000, debug=True)
