import os

files_to_delete = [
    'C:/Users/Noorul_Ahamed/OneDrive/Desktop/gravyclaw/public/style.css',
    'C:/Users/Noorul_Ahamed/OneDrive/Desktop/gravyclaw/public/app.js'
]

for f in files_to_delete:
    if os.path.exists(f):
        os.remove(f)
        print(f"Deleted: {f}")
    else:
        print(f"File not found: {f}")

print("done")
