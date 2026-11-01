"""Build a staging extract from the user-provided OSM XML; no network access."""
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET

root_dir = Path(__file__).resolve().parent
source = root_dir / 'source-data' / 'sonoma-plaza.osm'
output = root_dir / 'source-data' / 'sonoma-features.json'
raw = source.read_bytes()
root = ET.fromstring(raw)
nodes = {n.attrib['id']: [float(n.attrib['lon']), float(n.attrib['lat'])] for n in root.findall('node')}
features = []
missing = []
for way in root.findall('way'):
    tags = {t.attrib['k']: t.attrib['v'] for t in way.findall('tag')}
    street = tags.get('name', '').lower()
    if way.attrib['id'] == '27498206':
        category = 'plaza'
    elif 'building' in tags:
        category = 'building'
    elif tags.get('highway') in ('footway', 'path', 'pedestrian', 'steps'):
        category = 'pedestrian'
    elif tags.get('highway') and any(name in street for name in ('spain street', 'napa street', '1st street east', '1st street west')):
        category = 'frontage_street'
    else:
        continue
    refs = [n.attrib['ref'] for n in way.findall('nd')]
    absent = [ref for ref in refs if ref not in nodes]
    if absent:
        missing.append({'id': way.attrib['id'], 'nodes': absent})
        continue
    if category in ('plaza', 'building') and (len(refs) < 4 or refs[0] != refs[-1]):
        raise ValueError(f'Unclosed {category} way {way.attrib["id"]}')
    features.append({'category': category, 'osm_id': way.attrib['id'], 'version': way.attrib.get('version'),
                     'node_refs': refs, 'tags': tags, 'coordinates': [nodes[ref] for ref in refs]})
if missing:
    raise ValueError(f'Incomplete node references: {missing}')
if sum(f['category'] == 'plaza' for f in features) != 1:
    raise ValueError('Expected the Sonoma Plaza way exactly once')
payload = {'source_sha256': hashlib.sha256(raw).hexdigest(), 'bounds': root.find('bounds').attrib,
           'generator': root.attrib.get('generator'), 'features': features}
output.write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf8')
print(f'Wrote {len(features)} ways to {output.name}; source SHA-256 {payload["source_sha256"]}')
