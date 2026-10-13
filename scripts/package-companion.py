"""Create an unpacked-extension ZIP without touching earlier Library artifacts."""
from pathlib import Path
import json,sys,zipfile
root=Path(__file__).resolve().parents[1]/'companion'
out=Path(sys.argv[1])
m=json.loads((root/'manifest.json').read_text())
assert m['manifest_version']==3 and m['version']=='0.9.3'
for group in m['content_scripts']:
 for name in group['js']:assert (root/name).is_file(),name
assert (root/m['background']['service_worker']).is_file()
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
 for p in sorted(root.rglob('*')):
  if p.is_file():
   assert not p.is_symlink()
   assert p.suffix in {'.js','.json','.html','.css','.md','.png','.webm'},p
   z.write(p,p.relative_to(root))
with zipfile.ZipFile(out) as z:
 assert json.loads(z.read('manifest.json'))['version']=='0.9.3'
 assert not z.testzip()
 print(out, len(z.namelist()),'verified entries')
