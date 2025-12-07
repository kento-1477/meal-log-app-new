import os
from pathlib import Path

root = Path('/Users/a81808/Desktop/meal-log-app-new')
esscripts = root / 'node_modules' / 'esbuild'
node_bin = esscripts / 'bin'
installexe = esscripts / 'install.js'

# For demonstration, print contents
print('Exists:', esscripts.exists())
print('Files:', list(node_bin.iterdir()) if node_bin.exists() else 'missing bin')
