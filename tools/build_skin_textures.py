"""Web textures for the athletes' skin, eyes, brows, lashes and hair, from the
CC0 MakeHuman 1.1 photo textures fetched by tools/fetch_anatomy.py.

Run: python3 tools/build_skin_textures.py   (Pillow + numpy)

Layout (tools/face_atlas.json, shared with tools/rebuild_anatomy.py, which
moves the head's UV island into [1, 2] x [0, 1] so the shader can tell it apart):
  skin_<tone>_body.jpg  the whole MakeHuman body layout at 1024 (arms, hands, legs)
  skin_<tone>_face.jpg  the head's UV island at the source's full 2048 density
  hair.png              short hair over the same head island: L = strand detail, A = coverage
  face_detail.png       eyeballs, eyebrow and eyelash cards (RGBA atlas)

The dark-skinned source has a short afro photographed onto its scalp. That
hair becomes the hair layer (with its natural edge round the ears and the
nape; its front hairline, which sits high on this athlete's forehead, is
brought forward to a young man's); under it the scalp is replaced with shaved
scalp from the light-skinned source, recoloured, so that a fade or a buzz cut
shows skin where the hair layer thins out.
"""
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'art-sources' / 'makehuman'
OUT = ROOT / 'public' / 'assets' / 'textures'
LAYOUT = json.loads((Path(__file__).with_name('face_atlas.json')).read_text())
FACE = LAYOUT['face']; ATLAS = LAYOUT['atlas']
N = 2048

def load(name):
    return np.asarray(Image.open(SRC / name).convert('RGB')).astype(np.float32)

def read_obj(path, group_filter=None):
    verts, uvs, faces, group = [], [], {}, ''
    for line in path.read_text().splitlines():
        a = line.split()
        if not a: continue
        if a[0] == 'v': verts.append([float(x) for x in a[1:4]])
        elif a[0] == 'vt': uvs.append((float(a[1]), float(a[2])))
        elif a[0] == 'g': group = a[1]
        elif a[0] == 'f': faces.setdefault(group, []).append([(int(q.split('/')[0]) - 1, int(q.split('/')[1]) - 1) for q in a[1:]])
    return np.array(verts), np.array(uvs), faces

def base_head():
    """The head's UV island of base.obj, with the athlete's targets applied to
    its vertices (MakeHuman space: y up, z forward), as tools/rebuild_anatomy.py does."""
    verts, uvs, groups = read_obj(ROOT / 'art-sources' / 'base.obj')
    for name, strength in [('male.target', .85), ('athletic.target', .55)]:
        for line in (ROOT / 'art-sources' / name).read_text().splitlines():
            a = line.split()
            if len(a) == 4 and not line.startswith('#'): verts[int(a[0])] += np.array([float(x) for x in a[1:]]) * strength
    faces = groups['body']
    parent = list(range(len(uvs)))
    def find(x):
        while parent[x] != x: parent[x] = parent[parent[x]]; x = parent[x]
        return x
    for f in faces:
        for _, u in f[1:]: parent[find(u)] = find(f[0][1])
    islands = {}
    for f in faces: islands.setdefault(find(f[0][1]), []).append(f)
    # The head island is the one whose UVs reach furthest right (u > 0.98).
    head = max(islands.values(), key=lambda fs: max(uvs[u][0] for f in fs for _, u in f))
    eye_y = verts[[i for f in groups['helper-l-eye'] for i, _ in f]][:, 1].mean()
    return verts, uvs, head, eye_y

def rasterise(verts, uvs, faces, value):
    """Per texel of the 2048 layout: value(points) of the surface point it shows (NaN off the faces)."""
    out = np.full((N, N), np.nan, np.float32)
    for f in faces:
        for k in range(1, len(f) - 1):
            tri = [f[0], f[k], f[k + 1]]
            t = np.array([[uvs[u][0] * N, (1 - uvs[u][1]) * N] for _, u in tri]); P = verts[[i for i, _ in tri]]
            x0, y0 = np.floor(t.min(0)).astype(int); x1, y1 = np.ceil(t.max(0)).astype(int)
            xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + .5, np.arange(y0, y1 + 1) + .5)
            d = (t[1, 1] - t[2, 1]) * (t[0, 0] - t[2, 0]) + (t[2, 0] - t[1, 0]) * (t[0, 1] - t[2, 1])
            if abs(d) < 1e-9: continue
            a = ((t[1, 1] - t[2, 1]) * (xs - t[2, 0]) + (t[2, 0] - t[1, 0]) * (ys - t[2, 1])) / d
            b = ((t[2, 1] - t[0, 1]) * (xs - t[2, 0]) + (t[0, 0] - t[2, 0]) * (ys - t[2, 1])) / d
            c = 1 - a - b; inside = (a >= -.01) & (b >= -.01) & (c >= -.01)
            if not inside.any(): continue
            pts = a[inside][:, None] * P[0] + b[inside][:, None] * P[1] + c[inside][:, None] * P[2]
            out[(ys[inside] - .5).astype(int).clip(0, N - 1), (xs[inside] - .5).astype(int).clip(0, N - 1)] = value(pts)
    return out

def mask_of(uvs, faces):
    mask = Image.new('L', (N, N), 0); draw = ImageDraw.Draw(mask)
    for f in faces: draw.polygon([(uvs[u][0] * N, (1 - uvs[u][1]) * N) for _, u in f], fill=255)
    return np.asarray(mask) > 127

def face_box():
    u0, v0, u1, v1 = FACE['src']
    x0, y0 = round(u0 * N), round((1 - v1) * N)
    return x0, y0, x0 + FACE['size'][0], y0 + FACE['size'][1]

def smooth(a, radius):
    return np.asarray(Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(radius))).astype(np.float32) / 255

def grow(a, size):
    return np.asarray(Image.fromarray((a * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(size))).astype(np.float32) / 255

def shrink(a, size):
    return np.asarray(Image.fromarray((a * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(size))).astype(np.float32) / 255

def save_jpg(a, path, size=None):
    im = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    if size and im.size != tuple(size): im = im.resize(tuple(size), Image.LANCZOS)
    im.save(path, quality=86, optimize=True, progressive=True)
    print(f'{path.name}: {im.size[0]}x{im.size[1]}, {path.stat().st_size // 1024} KB')

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    light, dark = load('young_lightskinned_male_diffuse.png'), load('young_darkskinned_male_diffuse.png')
    verts, uvs, head, eye_y = base_head()
    island = mask_of(uvs, head)
    # ---- the photographed hair: a dark, near-neutral layer over the scalp
    red = dark[..., 0]
    raw = np.clip((80.0 - red) / (80.0 - 24.0), 0, 1) * island
    seeds = [(1306 + 120, 366 + 400), (1306 + 120, 366 + 1000), (1306 + 80, 366 + 700)]
    flood = Image.fromarray(((raw > 0.5) * 255).astype(np.uint8)).copy()
    for x, y in seeds:
        if flood.getpixel((x, y)) == 255: ImageDraw.floodfill(flood, (x, y), 128)
    region = (np.asarray(flood) == 128).astype(np.float32)   # the scalp's hair, not brows, lids or nostrils
    region = shrink(grow(region, 9), 5)                       # close pin holes between curls
    core = smooth(shrink(region, 13), 4)                      # solid hair away from the hairline
    alpha = np.clip(np.maximum(raw * 1.3 - 0.1, core), 0, 1) * smooth(grow(region, 5), 2)
    lum = dark.mean(axis=2)
    detail = np.clip(lum / 44.0, 0, 1)                        # 0.5 ~ the hair's mean, curls lighter
    # ---- a lower front hairline. Where each texel lies on the head: its
    # height between the eyes and the crown (0..1) and its bearing round the
    # head from straight ahead (radians). The photograph's hairline is ~2 cm
    # too high at the front (a receding look); a young athlete's runs ~6 cm
    # above the brows, a little higher at the temples, then down into the
    # photograph's own sideburns.
    ids = sorted({i for f in head for i, _ in f}); top = verts[ids, 1].max()
    upper = [i for i in ids if verts[i, 1] > eye_y]; zc = (verts[upper, 2].min() + verts[upper, 2].max()) / 2
    height = rasterise(verts, uvs, head, lambda p: (p[:, 1] - eye_y) / (top - eye_y))
    bearing = rasterise(verts, uvs, head, lambda p: np.arctan2(p[:, 0], p[:, 2] - zc))
    ahead = island & (np.abs(np.nan_to_num(bearing, nan=9)) < 0.12)
    photo_line = np.nanmin(np.where(ahead & (region > 0.5), height, np.nan))
    line = photo_line - 0.17 + 0.11 * (np.nan_to_num(bearing) / 0.75) ** 2
    front = 1 - np.clip((np.abs(np.nan_to_num(bearing, nan=9)) - 0.8) / 0.35, 0, 1)
    # A hairline is not a ruled line: the curls decide where each strand stops.
    reach = np.nan_to_num(height, nan=-9) - line + (detail - 0.5) * 0.05
    extend = np.clip(reach / 0.04 + 0.5, 0, 1) * front * island
    print(f'front hairline: photograph {photo_line:.2f} of eye-to-crown, now {photo_line - 0.17:.2f}')
    # Strand detail for the new hair: the photograph's crown, tiled (mirrored, so without seams).
    box = face_box(); best = None
    for y in range(box[1], box[3] - 192, 32):
        for x in range(box[0], box[2] - 192, 32):
            if region[y:y + 192, x:x + 192].min() > 0.5: best = (x, y); break
        if best: break
    patch = detail[best[1]:best[1] + 192, best[0]:best[0] + 192]
    tile = np.tile(np.block([[patch, patch[:, ::-1]], [patch[::-1], patch[::-1, ::-1]]]), (N // 384 + 1, N // 384 + 1))[:N, :N]
    detail = np.where(region > 0.5, detail, tile)
    alpha = np.maximum(alpha, extend)
    # Pad past the island's border so the seam at the back of the head stays covered.
    for _ in range(6): alpha = np.where(island, alpha, np.maximum(alpha, grow(alpha, 5)))
    detail = np.where(island, detail, np.median(detail[region > 0.5]))
    # ---- the dark skin under the hair: shaved scalp from the light source, recoloured
    under = smooth(grow(region, 31), 10)[..., None]
    skin = island & (region < 0.5) & (red > 55)
    lightskin = island & (region > 0.5)
    mean_d, std_d = dark[skin].mean(0), dark[skin].std(0)
    mean_l, std_l = light[lightskin].mean(0), light[lightskin].std(0)
    scalp = (light - mean_l) / std_l * std_d * 0.8 + mean_d * 0.96
    dark = dark * (1 - under) + scalp * under
    # ---- write: body at 1024, the head island at full density
    box = face_box()
    for tone, image in [('light', light), ('dark', dark)]:
        save_jpg(image, OUT / f'skin_{tone}_body.jpg', LAYOUT['body']['size'])
        face = image[box[1]:box[3], box[0]:box[2]]
        save_jpg(face, OUT / f'skin_{tone}_face.jpg')
        # Reference tone (sRGB) of the cheeks and forehead, for tinting toward a player's skin.
        h, w = face.shape[:2]
        sample = face[int(h * 0.42):int(h * 0.58), int(w * 0.55):int(w * 0.75)].reshape(-1, 3)
        print(f'  {tone} face reference colour: #' + ''.join(f'{int(round(c)):02x}' for c in np.median(sample, axis=0)))
    hair = np.stack([detail, alpha], axis=-1)[box[1]:box[3], box[0]:box[2]]
    im = Image.fromarray((hair * 255).astype(np.uint8), 'LA').resize(tuple(FACE['hairSize']), Image.LANCZOS)
    im.save(OUT / 'hair.png', optimize=True)
    print(f'hair.png: {im.size[0]}x{im.size[1]}, {(OUT / "hair.png").stat().st_size // 1024} KB')
    # ---- eyes, brows and lashes in one RGBA atlas
    W, H = ATLAS['size']; atlas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    for key, name in [('eye', 'brownlight_eye.png'), ('brow', 'eyebrow001.png'), ('lash', 'eyelashes01.png')]:
        src = Image.open(SRC / name).convert('RGBA'); sw, sh = src.size
        u0, v0, u1, v1 = ATLAS[key]['src']; x0, y0, x1, y1 = ATLAS[key]['dst']
        piece = src.crop((round(u0 * sw), round((1 - v1) * sh), round(u1 * sw), round((1 - v0) * sh))).resize((x1 - x0, y1 - y0), Image.LANCZOS)
        if key == 'eye': piece.putalpha(255)
        else:
            if key == 'lash':
                # A man's lower lashes are short and fine: halve their cards' coverage.
                lv, lvt, lf = read_obj(SRC / 'eyelashes01.obj'); cards = {}
                parent = list(range(len(lv)))
                def find(x):
                    while parent[x] != x: parent[x] = parent[parent[x]]; x = parent[x]
                    return x
                for f in lf[next(iter(lf))]:
                    for i, _ in f[1:]: parent[find(i)] = find(f[0][0])
                for f in lf[next(iter(lf))]: cards.setdefault(find(f[0][0]), []).append(f)
                centre = lv[:, 1].mean(); lower = Image.new('L', piece.size, 0); draw = ImageDraw.Draw(lower)
                for fs in cards.values():
                    if lv[[i for f in fs for i, _ in f], 1].mean() > centre: continue
                    for f in fs: draw.polygon([((lvt[u][0] - u0) / (u1 - u0) * (x1 - x0), (1 - (lvt[u][1] - v0) / (v1 - v0)) * (y1 - y0)) for _, u in f], fill=255)
                a = np.asarray(piece).astype(np.float32); low = np.asarray(lower.filter(ImageFilter.MaxFilter(5)))[..., None] > 127
                a[..., 3:] = np.where(low, a[..., 3:] * 0.5, a[..., 3:]); piece = Image.fromarray(a.astype(np.uint8), 'RGBA')
            # Card colour comes from the player's hair colour; keep the strands' shading in RGB.
            a = np.asarray(piece).astype(np.float32); a[..., :3] = np.where(a[..., 3:] > 0, a[..., :3], 40)
            piece = Image.fromarray(a.astype(np.uint8), 'RGBA')
        atlas.paste(piece, (x0, y0))
    atlas.save(OUT / 'face_detail.png', optimize=True)
    print(f'face_detail.png: {W}x{H}, {(OUT / "face_detail.png").stat().st_size // 1024} KB')

if __name__ == '__main__':
    main()
