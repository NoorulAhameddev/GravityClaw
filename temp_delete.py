import os

files = [
  'C:/Users/Noorul_Ahamed/OneDrive/Desktop/gravyclaw/public/style.css',
  'C:/Users/Noorul_Ahamed/OneDrive/Desktop/gravyclaw/public/app.js',
  'C:/Users/Noorul_Ahamed/OneDrive/Desktop/gravyclaw/delete_files.py'
]

for f in files:
    if os.path.exists(f):
        os.remove(f)
        print(f'Deleted: {f}')
    else:
        print(f'Not found: {f}')

print('Done')
print('\n--- Contents of public directory ---')
import os
public_dir = 'C:/Users/Noorul_Ahamed/OneDrive/Desktop/gravyclaw/public'
if os.path.exists(public_dir):
    files_in_dir = os.listdir(public_dir)
    for file in sorted(files_in_dir):
        print(file)
