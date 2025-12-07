import json
from pathlib import Path
p = Path('/Users/a81808/Desktop/meal-log-app-new/apps/server/package.json')
data = json.loads(p.read_text())
scripts = data.get('scripts',{})
scripts['postinstall'] = 'echo skip prisma generate'
data['scripts']=scripts
p.write_text(json.dumps(data, indent=2))
