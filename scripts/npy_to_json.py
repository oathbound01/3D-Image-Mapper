import numpy as np
import json
import os
import sys

if len(sys.argv) < 2:
    print("Usage: python convert_npy.py <path_to_npy_folder>")
    sys.exit(1)

input_folder = sys.argv[1]

if not os.path.isdir(input_folder):
    print(f"Error: Folder not found at '{input_folder}'")
    sys.exit(1)

print(f"Converting .npy files in '{input_folder}' to .json...")

for i in range(2, 7):
    npy_filename = f'T_{i}1.npy'
    json_filename = f'T_{i}1.json'

    npy_path = os.path.join(input_folder, npy_filename)
    json_path = os.path.join(input_folder, json_filename)

    if os.path.exists(npy_path):
        try:
            matrix = np.load(npy_path)

            matrix_list = matrix.tolist()

            with open(json_path, 'w') as f:
                json.dump(matrix_list, f, indent=4)

            print(f"  Successfully converted {npy_filename} -> {json_filename}")
        except Exception as e:
            print(f"  Failed to convert {npy_filename}. Error: {e}")
    else:
        print(f"  Warning: {npy_filename} not found. Skipping.")

print("\nConversion complete.")