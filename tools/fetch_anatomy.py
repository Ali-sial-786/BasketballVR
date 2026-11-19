"""Fetch the pinned CC0 MakeHuman inputs for the optional Blender rebuild.

art-sources/            base mesh, rig, weights and macro targets (tools/rebuild_anatomy.py)
art-sources/makehuman/  eye, eyebrow and eyelash proxies and the skin, eye, brow and
                        lash photo textures (tools/rebuild_anatomy.py, tools/build_skin_textures.py)

The proxies and textures are MakeHuman 1.1 system assets (CC0, see CREDITS.md):
the eye proxy from the upstream repository, the rest from the
dmaugis/makehuman-py3-assets mirror of the same assets (textures through Git LFS).
"""
from pathlib import Path
import hashlib
import urllib.request

root = Path(__file__).resolve().parents[1] / 'art-sources'
root.mkdir(exist_ok=True)
base = 'https://raw.githubusercontent.com/makehumancommunity/makehuman/a8bc2d54ff0ac92e78ff71431b1023eda42bf482/makehuman/data/'
MIRROR = '2f4033a364a7e97479e17ed630ccb999395730c6'
mirror = f'https://raw.githubusercontent.com/dmaugis/makehuman-py3-assets/{MIRROR}/base/'
lfs = f'https://media.githubusercontent.com/media/dmaugis/makehuman-py3-assets/{MIRROR}/base/'
files = [
    ('base.obj', base + '3dobjs/base.obj', '8e761e6624b8f54536409135d1636da63b32486a90d4897f84e121d144f6fb4c'),
    ('skeleton.json', base + 'rigs/default.mhskel', '99f179bce0aa850b45d4191a1d0d234c5851f881c057439470ded3bddf729a24'),
    ('weights.json', base + 'rigs/default_weights.mhw', '0f3641d651ae3d00ad6b4ccee43142edb109d3bd909d27d9e4139ef1beed8625'),
    ('male.target', base + 'targets/macrodetails/caucasian-male-young.target', '70e228ba7164737dae664454394536fc5935fa48d333c1a97d77e2dc6eacc5f5'),
    ('athletic.target', base + 'targets/macrodetails/universal-male-young-maxmuscle-averageweight.target', 'c171ff9cc95e96273beb3e3b1969a01988c2d4982ebc6fe04bf81cf72ee3b295'),
    # Face and skin: proxies are fitted to the base mesh with their .mhclo files.
    ('makehuman/high-poly.obj', base + 'eyes/high-poly/high-poly.obj', 'da2493215b708a344c33dc72f2a9a5b8fa985dcc5a70ad3b208995cf871da8e1'),
    ('makehuman/high-poly.mhclo', base + 'eyes/high-poly/high-poly.mhclo', 'b183cfe37120ab726f9b3f2ea6cd3a64c44ce7b4bd91a77c841cf70c04f83a0d'),
    ('makehuman/eyebrow001.obj', mirror + 'eyebrows/eyebrow001/eyebrow001.obj', 'b5bd3783888e31ff89d1e232cdf6269f5cc951eb25780c94f2642fbe25831e1b'),
    ('makehuman/eyebrow001.mhclo', mirror + 'eyebrows/eyebrow001/eyebrow001.mhclo', '649104e2413cd343e1e462f5cc8ed020b207b0fe39adddaeead88db24a522501'),
    ('makehuman/eyelashes01.obj', mirror + 'eyelashes/eyelashes01/eyelashes01.obj', 'c1e68c68fa87c65839c73561954805e6e91fffeba46fba0e30a3f7a28d8e1322'),
    ('makehuman/eyelashes01.mhclo', mirror + 'eyelashes/eyelashes01/eyelashes01.mhclo', '07d75823f0578d46734dfcc48004dd730ff8133883470370a28a3bc7fde4e412'),
    ('makehuman/young_lightskinned_male_diffuse.png', lfs + 'skins/textures/young_lightskinned_male_diffuse.png', '862a26e335e958b70534cb5f0d7c47ef30ab148a56c42b3e9da969cf76f12963'),
    ('makehuman/young_darkskinned_male_diffuse.png', lfs + 'skins/textures/young_darkskinned_male_diffuse.png', 'e3f0dbb634e4c68561338f0087f7a122444e84ec56df102212f1222aa12e4d50'),
    ('makehuman/brownlight_eye.png', lfs + 'eyes/materials/brownlight_eye.png', '3f43a4de70e446186dac1760cfa01dfe36d530ed7564208455395b0ebcdf788a'),
    ('makehuman/eyebrow001.png', lfs + 'eyebrows/eyebrow001/eyebrow001.png', '9940f7d0b1b223709a19b05156ba6f6e9e4dbdbced02d7574f4d51d72c58967b'),
    ('makehuman/eyelashes01.png', lfs + 'eyelashes/eyelashes01/eyelashes01.png', '4b69c0fff2648874460e9caf80c31413c444218a5c50afebc425aeaa65484a35'),
]
(root / 'makehuman').mkdir(exist_ok=True)
for name, url, digest in files:
    data = urllib.request.urlopen(url).read()
    if hashlib.sha256(data).hexdigest() != digest:
        raise RuntimeError(f'Checksum mismatch: {name}')
    (root / name).write_bytes(data)
    print(f'Verified {name}: {len(data)} bytes')
