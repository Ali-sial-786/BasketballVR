"""Build an athletic basketball character from the CC0 HM08 anatomy pipeline.
Run: blender -b -t 6 --python tools/rebuild_anatomy.py [-- --preview]
Inputs are fetched by tools/fetch_anatomy.py. All visible tailoring is
baked into the exported geometry; the only remaining modifiers are armature skinning.
The face uses MakeHuman's own CC0 eye, eyebrow and eyelash proxies, fitted with
their .mhclo files, and the photo textures laid out by tools/face_atlas.json
(build them first with tools/build_skin_textures.py: the hair shell is cut to
the coverage of public/assets/textures/hair.png).
"""
import bpy, bmesh, math, json, random, sys
import numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'art-sources'
MH = SRC / 'makehuman'
OUT = SRC / 'generated'
LAYOUT = json.loads((ROOT / 'tools' / 'face_atlas.json').read_text())
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
random.seed(51)
verts, uvs, groups, group = [], [], {}, ''
for line in (SRC / 'base.obj').read_text().splitlines():
    a = line.split()
    if not a: continue
    if a[0] == 'v': verts.append(Vector(map(float, a[1:4])))
    elif a[0] == 'vt': uvs.append(tuple(map(float, a[1:3])))
    elif a[0] == 'g': group = a[1]; groups.setdefault(group, [])
    elif a[0] == 'f': groups[group].append([(int(p.split('/')[0])-1, int(p.split('/')[1])-1) for p in a[1:]])
for fn, strength in [('male.target', .85), ('athletic.target', .55)]:
    for line in (SRC / fn).read_text().splitlines():
        a = line.split()
        if len(a) == 4 and not line.startswith('#'):
            verts[int(a[0])] += Vector(map(float, a[1:])) * strength
rawverts = [v.copy() for v in verts]   # MakeHuman space, for fitting proxies with their .mhclo files

# The head's UV island moves to [1, 2] x [0, 1], remapped onto the face texture's
# crop (tools/face_atlas.json): the skin shader samples the full-density face
# texture there and the 1024 body texture everywhere else.
def head_island():
    parent = list(range(len(uvs)))
    def find(x):
        while parent[x] != x: parent[x] = parent[parent[x]]; x = parent[x]
        return x
    for f in groups['body']:
        for i, u in f[1:]: parent[find(u)] = find(f[0][1])
    islands = {}
    for f in groups['body']: islands.setdefault(find(f[0][1]), set()).update(u for i, u in f)
    return max(islands.values(), key=lambda ids: max(uvs[u][0] for u in ids))
_fu0, _fv0, _fu1, _fv1 = LAYOUT['face']['src']
for u in head_island(): uvs[u] = (1. + (uvs[u][0] - _fu0) / (_fu1 - _fu0), (uvs[u][1] - _fv0) / (_fv1 - _fv0))

# MakeHuman decimetres to metres (Blender Z up). The head keeps MakeHuman's own
# adult proportions: an earlier stylised build widened the cranium (up to 21%),
# deepened it (18%) and stretched it (12%) above the jaw, which read as a
# bulbous skull with wide oval eyes once the face was photo-textured.
HEAD_WIDEN, HEAD_DEEPEN, HEAD_STRETCH = 0., 0., 1.
def convert(v):
    x, y, z = v
    y = (y + 8.45) * .10; x *= .10; z *= .10
    if y > 1.54:
        t = min(1., (y-1.54) / .13)
        x *= 1. + HEAD_WIDEN*t; z = .045 + (z-.045) * (1.+HEAD_DEEPEN*t)
        y = 1.54 + (y-1.54)*HEAD_STRETCH
    return Vector((x, -z, y))
verts = [convert(v) for v in verts]
sk = json.loads((SRC / 'skeleton.json').read_text())
rawweights = json.loads((SRC / 'weights.json').read_text())['weights']
def joint(name, end='head'):
    ids = sk['joints'][sk['bones'][name][end]]
    return sum((verts[i] for i in ids), Vector()) / len(ids)
def mapbone(n):
    if n.startswith(('finger', 'wrist', 'metacarpal')): return 'hand'+n[-2:]
    if n.startswith(('upperarm', 'shoulder')): return 'arm'+n[-2:]
    if n.startswith('lowerarm'): return 'forearm'+n[-2:]
    if n.startswith('upperleg'): return 'thigh'+n[-2:]
    if n.startswith('lowerleg'): return 'shin'+n[-2:]
    if n.startswith(('foot', 'toe')): return 'foot'+n[-2:]
    if n.startswith(('spine', 'breast', 'clavicle')): return 'spine'
    if n.startswith(('root', 'pelvis')): return 'hips'
    return 'head'
weights = [{} for v in verts]
gripweights = [{} for v in verts]
for bone, entries in rawweights.items():
    for i, weight in entries:
        if i >= len(weights): continue
        mapped = mapbone(bone)
        weights[i][mapped] = weights[i].get(mapped, 0.) + weight
        if bone.startswith('finger') and bone.endswith('.R'):
            gripweights[i][bone] = weight
positions = {'hips': joint('root'), 'spine': joint('spine03'), 'head': joint('neck01')}
parents = {'hips': None, 'spine': 'hips', 'head': 'spine'}
for side in ['.L', '.R']:
    for name, source, parent in [('arm','upperarm01','spine'), ('forearm','lowerarm01','arm'+side), ('hand','wrist','forearm'+side), ('thigh','upperleg01','hips'), ('shin','lowerleg01','thigh'+side), ('foot','foot','shin'+side)]:
        positions[name+side] = joint(source+side); parents[name+side] = parent
armdata = bpy.data.armatures.new('AthleteSkeleton')
arm = bpy.data.objects.new('AthleteRig', armdata)
bpy.context.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm; arm.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
for name, pos in positions.items():
    bone = armdata.edit_bones.new(name); bone.head = pos; bone.tail = pos+Vector((0,0,.10))
    if parents[name]: bone.parent = armdata.edit_bones[parents[name]]
bpy.ops.object.mode_set(mode='OBJECT'); arm.select_set(False)

def material(name, color, rough=.55, metal=0.):
    m = bpy.data.materials.new(name); m.diffuse_color = (*color,1); m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color,1); p.inputs['Roughness'].default_value = rough; p.inputs['Metallic'].default_value = metal
    return m
skin = material('Skin',(.58,.32,.19),.70)
lips = material('Lips',(.49,.245,.18),.62)
shirtmat = material('Shirt',(.105,.32,.34),.86)
shortmat = material('Shorts',(.025,.043,.065),.89)
accent = material('Accent',(.72,.84,.43),.72)
white = material('Shoe',(.83,.86,.84),.73)
sole = material('Sole',(.35,.40,.41),.85)
hair = material('Hair',(.031,.018,.013),.78)

def active(obj):
    bpy.ops.object.select_all(action='DESELECT'); obj.select_set(True); bpy.context.view_layer.objects.active = obj

def bind(obj, constant=None, ids=None, custom_weights=None, auxiliary=False):
    obj.parent = arm
    mod = obj.modifiers.new('Skin deformation','ARMATURE'); mod.object = arm
    for name in positions: obj.vertex_groups.new(name=name)
    for k, vertex in enumerate(obj.data.vertices):
        ww = {constant:1.} if constant else (custom_weights[k] if custom_weights is not None else weights[ids[k]])
        total = sum(ww.values()) or 1.
        for name, weight in ww.items():
            if weight > .001: obj.vertex_groups[name].add([k],weight/total,'REPLACE')
    if auxiliary:
        for k, old in enumerate(ids):
            for name, weight in gripweights[old].items():
                vg = obj.vertex_groups.get('grip_'+name) or obj.vertex_groups.new(name='grip_'+name)
                vg.add([k],weight,'REPLACE')
    return obj

def mesh(name, vs, fs, mat, constant=None, custom_weights=None):
    me = bpy.data.meshes.new(name); me.from_pydata(vs,[],fs); me.update()
    obj = bpy.data.objects.new(name,me); bpy.context.collection.objects.link(obj); me.materials.append(mat)
    for p in me.polygons: p.use_smooth = True
    if constant or custom_weights is not None: bind(obj,constant,custom_weights=custom_weights)
    return obj

def source_mesh(name, faces, mat, constant=None, auxiliary=False):
    ids = sorted({i for f in faces for i,u in f}); remap = {old:new for new,old in enumerate(ids)}
    obj = mesh(name,[verts[i] for i in ids],[[remap[i] for i,u in f] for f in faces],mat)
    uv = obj.data.uv_layers.new(name='UVMap')
    for poly, face in zip(obj.data.polygons, faces):
        for loop,(_,u) in zip(poly.loop_indices,face): uv.data[loop].uv = uvs[u]
    bind(obj,constant,ids=ids,auxiliary=auxiliary)
    return obj

def bake(obj, modifier):
    active(obj); bpy.ops.object.modifier_apply(modifier=modifier.name); obj.select_set(False)

def subdivide(obj, levels=1):
    mod = obj.modifiers.new('Baked sculpt smoothing','SUBSURF'); mod.levels = levels; bake(obj,mod)

def recalc(obj, weld=False):
    bm = bmesh.new(); bm.from_mesh(obj.data)
    if weld: bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00015)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces)); bm.to_mesh(obj.data); bm.free(); obj.data.update()

# ---- face: MakeHuman's own eye, eyebrow and eyelash proxies -------------------
# Each proxy vertex is a weighted triangle of base-mesh vertices plus an offset
# scaled by the head's measured size (.mhclo), so the targets above carry them
# into place exactly as MakeHuman fits them. UVs go into the face atlas.
def read_obj(path):
    v,vt,f=[],[],[]
    for line in path.read_text().splitlines():
        a=line.split()
        if not a:continue
        if a[0]=='v':v.append(Vector(map(float,a[1:4])))
        elif a[0]=='vt':vt.append(tuple(map(float,a[1:3])))
        elif a[0]=='f':f.append([(int(q.split('/')[0])-1,int(q.split('/')[1])-1) for q in a[1:]])
    return v,vt,f
def fit_proxy(path):
    scale=[1.,1.,1.];out=[];inside=False
    for line in path.read_text().splitlines():
        a=line.split()
        if not a or a[0].startswith('#'):continue
        if a[0] in ('x_scale','y_scale','z_scale'):
            n='xyz'.index(a[0][0]);scale[n]=abs(rawverts[int(a[1])][n]-rawverts[int(a[2])][n])/float(a[3])
        elif a[0]=='verts':inside=True
        elif inside and a[0][0].isdigit():
            if len(a)==1:out.append(rawverts[int(a[0])].copy());continue
            r=[int(x) for x in a[:3]];w=[float(x) for x in a[3:6]];d=[float(x) for x in a[6:9]] if len(a)>=9 else [0.,0.,0.]
            out.append(rawverts[r[0]]*w[0]+rawverts[r[1]]*w[1]+rawverts[r[2]]*w[2]+Vector((d[0]*scale[0],d[1]*scale[1],d[2]*scale[2])))
        else:inside=False
    return [convert(p) for p in out]
def atlas_uv(region,uv):
    (su0,sv0,su1,sv1),(x0,y0,x1,y1)=LAYOUT['atlas'][region]['src'],LAYOUT['atlas'][region]['dst'];W,H=LAYOUT['atlas']['size']
    s=(uv[0]-su0)/(su1-su0);t=(uv[1]-sv0)/(sv1-sv0)
    return (x0/W+s*(x1-x0)/W,1.-y1/H+t*(y1-y0)/H)
def proxy(name,stem,mat,region,keep=lambda f,vt:True):
    v,vt,f=read_obj(MH/(stem+'.obj'));fitted=fit_proxy(MH/(stem+'.mhclo'))
    f=[face for face in f if keep(face,vt)]
    ids=sorted({i for face in f for i,u in face});remap={old:new for new,old in enumerate(ids)}
    obj=mesh(name,[fitted[i] for i in ids],[[remap[i] for i,u in face] for face in f],mat)
    layer=obj.data.uv_layers.new(name='UVMap')
    for poly,face in zip(obj.data.polygons,f):
        for loop,(_,u) in zip(poly.loop_indices,face):layer.data[loop].uv=atlas_uv(region,vt[u])
    bind(obj,'head');return obj
# The eye globes, as fitted (one per side): centre and radius. The globes sit
# a little back from MakeHuman's fit: smoothing the skin rounds the lid margins
# back, and the lids must close over the globe with no white below the lower lid.
EYE_SET_BACK=.0015
def smooth01(t):t=max(0.,min(1.,t));return t*t*(3.-2.*t)
def eye_globes():
    v,vt,f=read_obj(MH/'high-poly.obj');fitted=fit_proxy(MH/'high-poly.mhclo')
    ball={i for face in f if not all(vt[u][0]>.86 and vt[u][1]<.14 for i,u in face) for i,u in face}
    out={}
    for sign in (1,-1):
        pts=[fitted[i]+Vector((0,EYE_SET_BACK,0)) for i in ball if fitted[i].x*sign>0]
        r=(max(p.z for p in pts)-min(p.z for p in pts))/2
        out[sign]=(Vector((sum(p.x for p in pts)/len(pts),min(p.y for p in pts)+r,(max(p.z for p in pts)+min(p.z for p in pts))/2)),r)
    return out
GLOBES=eye_globes()

# Skin is retained only where it is visible; no bare toes or concealed anatomy.
shoulder = joint('upperarm01.L'); arm_direction = (joint('lowerarm01.L')-shoulder).normalized()
def sleeve_distance(p):
    q = Vector((abs(p.x),p.y,p.z)); return (q-shoulder).dot(arm_direction)
def exposed(p):
    if p.z < .286: return False
    if p.z < .805: return True
    if abs(p.x)>.405: return True
    if p.z>1.020 and abs(p.x) > .233 and sleeve_distance(p) > .130: return True
    if p.z > 1.479: return True
    return p.z > 1.437 and abs(p.x)<.048 and p.y<-.027
bodyfaces = groups['body']  # Complete anatomy under the basketball armholes and neckline.
body = source_mesh('Athlete_Body',bodyfaces,skin,auxiliary=True)
# The unsmoothed skin, for seating eyebrow cards on the smoothed one (below).
cage_bvh = BVHTree.FromPolygons(verts,[[i for i,u in f] for f in bodyfaces])
# Retain the adult MakeHuman nose, jaw and neutral mouth; no cartoon face warp.
subdivide(body,1)
mod=body.modifiers.new('Baked efficient sculpt topology','DECIMATE');mod.ratio=.56;mod.use_collapse_triangulate=True;bake(body,mod)
body.data.materials.append(lips)
# MakeHuman's relaxed lids sit low, over a third of the iris, which reads as
# sleepy once the eyes are real. Raise each upper lid the way a lid moves: turn
# it about the globe's centre, the margin most, fading out toward the brow and
# the corners, so the margin stays on the eyeball.
LID_LIFT=.13
for sign,(c,r) in GLOBES.items():
    for v in body.data.vertices:
        d=v.co-c;across=abs(d.x)/(r*1.25);up=d.z/r
        if across>=1. or up<-.15 or d.length>r+.016 or d.y>0.:continue
        w=(1.-smooth01(across**2))*smooth01((up+.15)/.35)*(1.-smooth01((d.length-r-.004)/.012))
        if w<=0.:continue
        v.co=c+Matrix.Rotation(-LID_LIFT*w,3,'X')@d
body.data.update()
# Lip pigment is restricted to the actual vermilion rings, below the nose.
face_shift = joint('eye.L').z - 1.6487
for poly in body.data.polygons:
    c = poly.center; edge = max(0.,1.-(abs(c.x)/.029)**2)
    if c.y < -.151 and 1.571+face_shift-.001*edge < c.z < 1.574+face_shift+.007*edge and abs(c.x)<.029:
        poly.material_index=1

# Expression shapes are built on the final exported topology.
body.shape_key_add(name='Basis',from_mix=False)
for name in ['FaceNarrow','FaceRound','FaceSoft','EyesOpen','Smile','MouthSerious','BrowsRaised','Blink','HandGrip']:
    key = body.shape_key_add(name=name,from_mix=False)
    if name=='HandGrip': continue
    for i, v in enumerate(body.data.vertices):
        x,y,z=v.co; mask=max(0.,min(1.,(z-1.57)/.10)); front=max(0.,min(1.,(-y-.065)/.07))
        if name=='FaceNarrow': key.data[i].co.x*=1.-.13*mask
        elif name=='FaceRound': key.data[i].co.x*=1.+.12*mask
        elif name=='FaceSoft': key.data[i].co.y-=.0045*mask*front
        elif name=='EyesOpen':
            for sign in [-1,1]:
                dx=(x-sign*.035)/.025; dz=(z-1.6483)/.018
                if y<-.14 and abs(dx)<1.4 and abs(dz)<1.5:
                    key.data[i].co.z += (z-1.6483)*.27*math.exp(-dx*dx*1.7-dz*dz)*front
        elif name=='Blink':
            continue # Dedicated lid surfaces avoid collapsing anatomical cheek topology.
        elif name in ['Smile','MouthSerious'] and 1.551<z<1.599 and abs(x)<.052:
            maskmouth=math.exp(-((z-1.575)/.018)**2)*front
            key.data[i].co.z+=(.0085 if name=='Smile' else -.004)*min(1.,abs(x)/.024)*maskmouth
        elif name=='BrowsRaised' and 1.659<z<1.701:
            key.data[i].co.z+=.005*front*math.exp(-((z-1.676)/.015)**2)
# Curl real finger chains around a racket handle while keeping wrist skin continuous.
across = (joint('finger5-1.R')-joint('finger2-1.R')).normalized()
transforms={};finger_axis={}
for finger in range(1,6):
    heads=[joint('finger%d-%d.R'%(finger,j)) for j in range(1,4)]
    axis=across if finger!=1 else Vector((0,0,1))
    target=positions['hand.R']+Vector((-.025,-.055,-.045))
    # Select the curl direction bringing the distal phalanx toward the handle.
    signs=[-1.,1.]
    sign=min(signs,key=lambda s:(heads[0]+Matrix.Rotation(s*1.3,4,axis)@(heads[2]-heads[0])-target).length)
    finger_axis[finger]=(axis,sign)
    angles=[1.6,2.8,3.5] if finger!=1 else [1.0,1.6,2.0]
    posehead=heads[0].copy()
    for j in range(3):
        rot=Matrix.Rotation(sign*angles[j],4,axis)
        if j: posehead=posehead+previous_rot@(heads[j]-heads[j-1])
        transforms['grip_finger%d-%d.R'%(finger,j+1)]=(heads[j],posehead.copy(),rot)
        previous_rot=rot
key=body.data.shape_keys.key_blocks['HandGrip']
for i,v in enumerate(body.data.vertices):
    delta=Vector()
    for assignment in v.groups:
        name=body.vertex_groups[assignment.group].name
        if name in transforms:
            old,new,rot=transforms[name]; delta+=(new+rot@(v.co-old)-v.co)*assignment.weight
    key.data[i].co+=delta
# Hand shapes for play. The rest hand is a relaxed one; these are posed with real
# joint rotations skinned by the finger weights. (A full grip scaled down to a
# fraction is not a half-closed hand: it shortens the fingers into a claw.)
# curl: how far each phalanx turns toward the palm, knuckle to tip (radians).
# spread: how far the index and little finger fan away from the middle of the hand.
def hand_shape(name,curl,spread,thumb_curl,thumb_spread):
    key=body.shape_key_add(name=name,from_mix=False);pose={}
    along=(joint('finger3-2.R')-joint('finger3-1.R')).normalized();normal=across.cross(along).normalized()
    for finger in range(1,6):
        heads=[joint('finger%d-%d.R'%(finger,j)) for j in range(1,4)];axis,sign=finger_axis[finger]
        angles=thumb_curl if finger==1 else curl
        fan=Matrix.Rotation(thumb_spread if finger==1 else spread*(1.,1/3,-1/3,-1.)[finger-2],4,normal)
        posehead=heads[0].copy()
        for j in range(3):
            rot=Matrix.Rotation(sign*angles[j],4,axis)
            if j:posehead=posehead+previous@(heads[j]-heads[j-1])
            pose['grip_finger%d-%d.R'%(finger,j+1)]=(heads[j],heads[0]+fan@(posehead-heads[0]),fan@rot)
            previous=rot
    for i,v in enumerate(body.data.vertices):
        delta=Vector()
        for assignment in v.groups:
            group=body.vertex_groups[assignment.group].name
            if group in pose:
                old,new,rot=pose[group];delta+=(new+rot@(v.co-old)-v.co)*assignment.weight
        key.data[i].co+=delta
HAND_SHAPES=['HandOpen','HandBall']
hand_shape('HandOpen',[-.10,-.20,-.26],.15,[-.05,-.10,-.15],.25)   # flat and spread: a hand in a passing lane
hand_shape('HandBall',[.10,.30,.48],.22,[.05,.15,.25],.45)         # spread wide round a basketball
for vg in list(body.vertex_groups):
    if vg.name.startswith('grip_'):body.vertex_groups.remove(vg)

# Clip source helpers with interpolated UVs/weights to produce continuous, clean hems.
def interpolate(a,b,t):
    pos=a[0].lerp(b[0],t); uv=tuple(x+(y-x)*t for x,y in zip(a[1],b[1]))
    ww={k:a[2].get(k,0.)*(1-t)+b[2].get(k,0.)*t for k in set(a[2])|set(b[2])}
    return pos,uv,ww

# ---- tailoring ------------------------------------------------------------
# A basketball uniform is cut loose and hangs. Offsetting the body along its
# normals only makes a thicker body, so the two garments are draped instead:
# eased off the skin, dropped from whatever part of the body holds the cloth
# out above (chest, shoulder blades, hips, seat), relaxed until the surface is
# taut, and kept clear of the body throughout.
SHIRT_HEM=.915;SHORTS_HEM=.590
_tight_ids=sorted({i for f in groups['helper-tights'] for i,u in f});_tight_map={old:new for new,old in enumerate(_tight_ids)}
tights_bvh=BVHTree.FromPolygons([verts[i] for i in _tight_ids],[[_tight_map[i] for i,u in f] for f in groups['helper-tights']])
_probe=Vector((1.,0.,1.2));_hit,_normal,_,_=tights_bvh.find_nearest(_probe);TIGHTS_SIGN=1. if (_probe-_hit).dot(_normal)>0 else -1.
CROTCH=min(verts[i].z for i in _tight_ids if abs(verts[i].x)<.012 and verts[i].z>.7)
def hull2d(points):
    points=sorted(set(points))
    def half(seq):
        out=[]
        for q in seq:
            while len(out)>1 and (out[-1][0]-out[-2][0])*(q[1]-out[-2][1])-(out[-1][1]-out[-2][1])*(q[0]-out[-2][0])<=0:out.pop()
            out.append(q)
        return out[:-1]
    return half(points)+half(points[::-1])
def ray_exit(p,d,hull):
    # Distance from p, inside a convex outline, to the outline along d.
    best=0.
    for (ax,ay),(bx,by) in zip(hull,hull[1:]+hull[:1]):
        ex=bx-ax;ey=by-ay;den=d.x*ey-d.y*ex
        if abs(den)<1e-9:continue
        t=((ax-p.x)*ey-(ay-p.y)*ex)/den;u=((ax-p.x)*d.y-(ay-p.y)*d.x)/den
        if t>0. and -1e-6<=u<=1.+1e-6:best=max(best,t)
    return best
OVER=[]   # finished garments that later ones are worn over
def smooth01(t):t=max(0.,min(1.,t));return t*t*(3.-2.*t)
def tailor(obj,name):
    shirt=name=='Performance_Polo';me=obj.data
    lip=[(not shirt) and v.co.z<SHORTS_HEM-.004 for v in me.vertices]   # turned under at the leg opening
    def ease(p,n):
        if shirt:return .012+.018*smooth01((1.40-p.z)/.44)
        outward=n.x*(1. if p.x>0 else -1.)
        return .012+.054*smooth01((1.02-p.z)/.40)*(.2+.8*smooth01(outward*.7+.5))
    eased=[]
    for i,v in enumerate(me.vertices):
        e=.004 if lip[i] else ease(v.co,v.normal);eased.append(e);v.co+=v.normal*e
    me.update()
    if not shirt:
        # One garment, not two sleeves: across the seat and the front the cloth
        # spans from leg to leg down to a dropped crotch, then parts into the legs.
        levels={}
        for i,v in enumerate(me.vertices):
            if lip[i]:continue
            for k in range(int((v.co.z-.016)*100),int((v.co.z+.016)*100)+1):levels.setdefault(k,[]).append((v.co.x,v.co.y))
        hulls={k:hull2d(points) for k,points in levels.items() if len(points)>5}
        for i,v in enumerate(me.vertices):
            amount=smooth01((v.co.z-(CROTCH-.105))/.085)*(1.-smooth01((v.co.z-(CROTCH+.07))/.10));hull=hulls.get(int(round(v.co.z*100)))
            if lip[i] or amount<=0. or not hull:continue
            d=Vector((v.normal.x,v.normal.y,0.))
            if d.length<.35:continue
            d.normalize();centre=sum((Vector((x,y,0.)) for x,y in hull),Vector())/len(hull);radial=Vector((v.co.x-centre.x,v.co.y-centre.y,0.))
            if radial.length<1e-5:continue
            if d.dot(radial.normalized())<.2:
                # Facing the other leg: left alone between the thighs, drawn straight out across the seat.
                if v.co.z<CROTCH+.012:continue
                d=radial.normalized()
            v.co+=d*amount*min(.07,ray_exit(v.co,d,hull))
        me.update()
    # Hang: cloth cannot sit further in than the cloth above it, less a small fall-in.
    P=[v.co.copy() for v in me.vertices];D=[]
    for v in me.vertices:
        h=Vector((v.normal.x,v.normal.y,0.));D.append(h.normalized() if h.length>.35 else None)
    fall=.07 if shirt else .045;top=1.37 if shirt else 1.02
    for i,v in enumerate(me.vertices):
        d=D[i];p=P[i]
        if d is None or lip[i] or p.z>top:continue
        inner=(not shirt) and p.z<.90 and d.x*(1. if p.x>0 else -1.)<-.25
        if inner:continue
        best=0.
        for j,q in enumerate(P):
            dz=q.z-p.z
            if dz<.004 or D[j] is None or lip[j] or d.dot(D[j])<.80:continue
            if (not shirt) and p.z<.88 and p.x*q.x<0:continue
            dx=q.x-p.x;dy=q.y-p.y;out=d.x*dx+d.y*dy
            if out<=0. or out>.07 or abs(d.x*dy-d.y*dx)>.045:continue
            best=max(best,out-fall*dz)
        if best>0.:v.co+=d*min(best,.05)
    me.update()
    # Relax to a taut surface (heights are kept), never closer to the body than the ease allows.
    for round_ in range(7):
        bm=bmesh.new();bm.from_mesh(me)
        bmesh.ops.smooth_vert(bm,verts=[v for v in bm.verts if not lip[v.index]],factor=.5,use_axis_x=True,use_axis_y=True,use_axis_z=False)
        bm.to_mesh(me);bm.free();me.update()
        for i,v in enumerate(me.vertices):
            hit,normal,_,distance=tights_bvh.find_nearest(v.co)
            if hit is None:continue
            gap=(v.co-hit).dot(normal)*TIGHTS_SIGN;need=eased[i]*(.5 if lip[i] else .85)
            if gap<need:v.co+=normal*TIGHTS_SIGN*(need-gap)
            for under in OVER:
                hit,normal,_,distance=under.find_nearest(v.co)
                if hit is None or distance>.06 or D[i] is None:continue
                # (the finished shell is closed at its rims, so its face normals point out of it)
                gap=(v.co-hit).dot(normal)
                if gap<.009 and normal.dot(D[i])>.2:v.co+=D[i]*(.009-gap)
    # Soft folds where the cloth gathers: above the hem of the jersey, down the legs of the shorts.
    for i,v in enumerate(me.vertices):
        if D[i] is None or lip[i]:continue
        p=v.co;around=math.atan2(p.x,-p.y)
        if shirt:
            amount=smooth01((1.26-p.z)/.16)*.0026
            v.co+=D[i]*amount*(math.sin(around*9.+p.z*21.)+.6*math.sin(around*17.-p.z*33.+1.3))
        else:
            amount=smooth01((1.0-p.z)/.14)*.0030
            v.co+=D[i]*amount*(math.sin(around*7.+p.z*26.+p.x*9.)+.6*math.sin(around*15.-p.z*41.+.7))
    # Crisp horizontal hems; the turned-under lip sits just inside the opening.
    for i,v in enumerate(me.vertices):
        if shirt:
            if v.co.z<SHIRT_HEM+.004:v.co.z=SHIRT_HEM
            if v.co.z>1.484:v.co.z=1.490
        else:
            if lip[i]:v.co.z=SHORTS_HEM+.008
            elif v.co.z<SHORTS_HEM+.012:v.co.z=SHORTS_HEM
            if v.co.z>1.085:v.co.z=1.087
    me.update()

garment_boundaries={}
def clipped_source(name, faces, mat, fields, inflate):
    vs,fs,tex,ww=[],[],[],[]
    for face in faces:
        poly=[(verts[i].copy(),uvs[u],weights[i]) for i,u in face]
        for field in fields:
            output=[]
            if not poly:break
            previous=poly[-1]; dp=field(previous[0])
            for current in poly:
                dc=field(current[0])
                if (dp>=0)!=(dc>=0): output.append(interpolate(previous,current,dp/(dp-dc)))
                if dc>=0:output.append(current)
                previous=current;dp=dc
            poly=output
        if len(poly)<3:continue
        faceids=[]
        for pos,uv,weights_ in poly:
            faceids.append(len(vs));vs.append(pos);tex.append(uv);ww.append(weights_)
        fs.append(faceids)
    obj=mesh(name,vs,fs,mat,custom_weights=ww)
    uv=obj.data.uv_layers.new(name='UVMap')
    for poly in obj.data.polygons:
        for loop,idx in zip(poly.loop_indices,poly.vertices):uv.data[loop].uv=tex[idx]
    recalc(obj,True)
    if name in ('Performance_Polo','Tailored_Shorts'):tailor(obj,name)
    else:
        for v in obj.data.vertices:v.co+=v.normal*inflate
    obj.data.update()
    subdivide(obj,1)
    # Rim-only thickness keeps sewn openings solid without doubling every cloth face.
    bm=bmesh.new();bm.from_mesh(obj.data);adj={}
    for e in bm.edges:
        if e.is_boundary:
            a,b=e.verts;adj.setdefault(a,[]).append(b);adj.setdefault(b,[]).append(a)
    unseen=set(adj);loops=[]
    while unseen:
        first=unseen.pop();loop=[first];previous=None;current=first
        while True:
            nxt=next((v for v in adj[current] if v!=previous and v in unseen),None)
            if nxt is None:break
            unseen.remove(nxt);loop.append(nxt);previous,current=current,nxt
        if len(loop)>7:loops.append([v.co.copy() for v in loop])
    garment_boundaries[name]=loops;bm.free()
    solid=obj.modifiers.new('Baked fabric thickness','SOLIDIFY');solid.thickness=.0025;solid.offset=-.15;solid.use_rim_only=True;bake(obj,solid)
    recalc(obj)
    return obj
shirtfields=[lambda p:p.z-SHIRT_HEM,lambda p:1.491-p.z,lambda p:max(.236-abs(p.x),.148-sleeve_distance(p)),lambda p:max(p.y+.056,abs(p.x)-max(0.,(p.z-1.438)*.47))]
pants=clipped_source('Tailored_Shorts',groups['helper-tights'],shortmat,[lambda p:p.z-(SHORTS_HEM-.03),lambda p:1.087-p.z],.018)
# The jersey is worn out, over the shorts: it is draped over them as well as over the body.
OVER.append(BVHTree.FromPolygons([v.co for v in pants.data.vertices],[list(p.vertices) for p in pants.data.polygons]))
tee=clipped_source('Performance_Polo',groups['helper-tights'],shirtmat,shirtfields,.013)
# The kit has a readable original identity at the broadcast distance: an angled
# shoulder yoke, bounded sleeve cuffs and a side inset rather than tiny decoration.
# Clip actual fabric triangles for clean panel borders instead of recoloring
# whole polygons, whose coarse boundary looked ragged in the live creator.
clipped_source('Angled chest band',groups['helper-tights'],white,
               shirtfields+[lambda p:-.070-p.y,lambda p:.176-abs(p.x),
                            lambda p:1.362+.22*p.x-p.z,
                            lambda p:p.z-(1.330+.22*p.x)],.015)
for sign in [-1,1]:
    clipped_source('Shoulder color-block'+str(sign),groups['helper-tights'],accent,
                   shirtfields+[lambda p:p.z-1.421,lambda p,s=sign:s*p.x-.068],.015)
    clipped_source('Sleeve cuff-block'+str(sign),groups['helper-tights'],accent,
                   shirtfields+[lambda p,s=sign:s*p.x-.230,lambda p:sleeve_distance(p)-.106],.015)
    clipped_source('Short side inset'+str(sign),groups['helper-tights'],accent,
                   [lambda p:p.z-.833,lambda p:1.061-p.z,
                    lambda p,s=sign:s*p.x-(.142+.025*(1.061-p.z)/.228)],.041)
# Smooth skinned accessories have baked placement and compact material batches.
def sphere(name,loc,size,mat,bone='head',segments=20,rings=12):
    bpy.ops.object.select_all(action='DESELECT');bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,location=loc)
    obj=bpy.context.object;obj.name=name;obj.scale=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    for v in obj.data.vertices:v.co+=obj.location
    obj.location=(0,0,0);obj.data.materials.append(mat)
    for p in obj.data.polygons:p.use_smooth=True
    bind(obj,bone);obj.select_set(False);return obj

def tube(name,points,radius,mat,bone='head',resolution=2,closed=False):
    cu=bpy.data.curves.new(name,'CURVE');cu.dimensions='3D';cu.resolution_u=3;cu.bevel_depth=radius;cu.bevel_resolution=resolution
    spline=cu.splines.new('BEZIER');spline.bezier_points.add(len(points)-1);spline.use_cyclic_u=closed
    for b,p in zip(spline.bezier_points,points):b.co=p;b.handle_left_type=b.handle_right_type='AUTO'
    obj=bpy.data.objects.new(name,cu);bpy.context.collection.objects.link(obj);active(obj);bpy.ops.object.convert(target='MESH');obj=bpy.context.object;obj.data.materials.append(mat)
    for p in obj.data.polygons:p.use_smooth=True
    bind(obj,bone);obj.select_set(False);return obj

eyeball=material('Eyeball',(.9,.9,.9),.25)
browmat=material('Brow',(.03,.02,.015),.7)
lashmat=material('Lash',(.02,.015,.012),.7)
# High-poly eyes: each globe is an eyeball plus a clear cornea shell (its UVs
# sit in the texture's transparent corner). The cornea is left out; the shader
# gives the globe a wet clear coat instead.
eyes=proxy('Details_Eyes','high-poly',eyeball,'eye',keep=lambda f,vt:not all(vt[u][0]>.86 and vt[u][1]<.14 for i,u in f))
for v in eyes.data.vertices:v.co.y+=EYE_SET_BACK
brows=proxy('Details_Brows','eyebrow001',browmat,'brow')
lashes=proxy('Details_Lashes','eyelashes01',lashmat,'lash')
# Lashes are seen from both sides: a reversed copy of every card.
bm=bmesh.new();bm.from_mesh(lashes.data)
copy=bmesh.ops.duplicate(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces))['geom']
bmesh.ops.reverse_faces(bm,faces=[g for g in copy if isinstance(g,bmesh.types.BMFace)])
bm.to_mesh(lashes.data);bm.free();lashes.data.update()
# The proxies fit the unsmoothed skin; the brows keep their height above it on the smoothed one.
skin_now=BVHTree.FromPolygons([v.co for v in body.data.vertices],[list(p.vertices) for p in body.data.polygons])
for v in brows.data.vertices:
    hit,normal,_,_=cage_bvh.find_nearest(v.co);lift=max(.0004,(v.co-hit).dot(normal)) if hit else .0004
    hit,normal,_,_=skin_now.find_nearest(v.co)
    if hit:v.co=hit+normal*lift
brows.data.update()
for card in (eyes,brows,lashes):
    for p in card.data.polygons:p.use_smooth=True

# A folded polo collar and a narrow placket are supported by real fabric geometry.
neckloop=max(garment_boundaries['Performance_Polo'],key=lambda loop:sum(p.z for p in loop)/len(loop))
# Follow the actual finished neckline, including its small V, so no collar edge floats.
collarvs=[];collarfs=[];count=len(neckloop)
for ring in range(3):
    for p in neckloop:
        radial=Vector((p.x,p.y+.015,0));radial.normalize()
        if ring==0:q=p+radial*.0015+Vector((0,0,.001))
        elif ring==1:q=p+radial*.002+Vector((0,0,.014))
        else:q=p+radial*.021+Vector((0,0,-.006))
        collarvs.append(q)
for ring in range(2):
    for i in range(count):
        a=ring*count+i;b=ring*count+(i+1)%count;collarfs.append((a,b,b+count,a+count))
collar=mesh('Folded collar',collarvs,collarfs,shirtmat,'spine');recalc(collar)
solid=collar.modifiers.new('Collar cloth edge','SOLIDIFY');solid.thickness=.0020;solid.use_rim_only=True;bake(collar,solid)
# Add a quiet topstitch around the fold.
tube('Collar topstitch',[p+Vector((0,0,.0145))for p in neckloop[::max(1,count//40)]],.0007,accent,'spine',1,True)
# Sample the garment front so embroidery/buttons sit on the fabric.
tee_bvh=BVHTree.FromPolygons([v.co for v in tee.data.vertices],[list(p.vertices)for p in tee.data.polygons])
def clothfront(x,z,offset=.002):
    hit=tee_bvh.ray_cast(Vector((x,-.6,z)),Vector((0,1,0)),1.)[0]
    return Vector((x,(hit.y if hit else -.13)-offset,z))
placketpoints=[clothfront(0,z) for z in [1.440,1.407,1.374]]
tube('Polo placket',placketpoints,.0045,shirtmat,'spine')
for z in [1.388,1.416]:sphere('Polo button',clothfront(0,z,.005),(.0023,.0012,.0023),white,'spine',12,8)
tube('Original chest crest',[clothfront(x,z,.0035)for x,z in[(.083,1.406),(.076,1.400),(.080,1.389),(.089,1.386),(.095,1.392)]],.0015,accent,'spine',1)
# An original open court-ring badge on the rear reads in ordinary near-court play.
# Every point is sampled from the garment, so the ink follows the actual shirt.
def clothback(x,z,offset=.0015):
    hit=tee_bvh.ray_cast(Vector((x,.60,z)),Vector((0,-1,0)),1.)[0]
    return Vector((x,(hit.y if hit else .080)+offset,z))
badgepoints=[]
for i in range(26):
    a=.48+(math.tau-.96)*i/25
    badgepoints.append(clothback(.076*math.cos(a),1.294+.071*math.sin(a)))
tube('Open court rear badge',badgepoints,.0065,white,'spine',1)
tube('Rear court badge baseline',[clothback(x,1.274)for x in [-.029,.014,.057]],.0065,accent,'spine',1)
# Sewn hems use extracted, ordered boundary loops from the source garment surface.
def boundary_loops(obj):
    bm=bmesh.new();bm.from_mesh(obj.data);bound=[e for e in bm.edges if e.is_boundary];adj={}
    for e in bound:
        a,b=e.verts;adj.setdefault(a,[]).append(b);adj.setdefault(b,[]).append(a)
    unseen=set(adj);result=[]
    while unseen:
        first=unseen.pop();loop=[first];previous=None;current=first
        while True:
            options=[v for v in adj[current]if v!=previous]
            nxt=next((v for v in options if v in unseen),None)
            if nxt is None:break
            unseen.remove(nxt);loop.append(nxt);previous,current=current,nxt
        if len(loop)>7:result.append([v.co.copy()for v in loop])
    bm.free();return result
# Thin waist piping follows the tailored silhouette. Other seams are subtle in texture.
pants_bvh=BVHTree.FromPolygons([v.co for v in pants.data.vertices],[list(p.vertices)for p in pants.data.polygons])
for sign in [-1,1]:
    points=[]
    for z in [1.054,1.000,.943,.878,.810,.770]:
        p,n,_,_=pants_bvh.ray_cast(Vector((sign*.5,.020,z)),Vector((-sign,0,0)),.5)
        if p is not None:points.append(p+n*.0007)
    tube('Shorts side piping',points,.0014,accent,'hips',1)

# Source ankle topology makes fitted athletic socks, with two restrained cuff bands.
for side in ['.L','.R']:
    sign=1 if side=='.L' else -1
    sockfaces=[f for f in groups['body'] if all(verts[i].x*sign>0 for i,u in f)]
    sock=clipped_source('Sock'+side,sockfaces,white,[lambda p:p.z-.125,lambda p:.310-p.z],.0035)
    # Rebind to shin/foot with a soft transition across the ankle.
    for v in sock.data.vertices:
        for vg in sock.vertex_groups:vg.remove([v.index])
        influence=max(0.,min(1.,(v.co.z-.14)/.06))
        sock.vertex_groups['shin'+side].add([v.index],influence,'REPLACE');sock.vertex_groups['foot'+side].add([v.index],1-influence,'REPLACE')
    x=positions['foot'+side].x
    # Transverse lofts create a true tennis shoe toe, heel and level sole.
    def shoe_loft(name,ys,widths,tops,bottom,mat):
        vs=[];faces=[];segments=16
        for y,w,top in zip(ys,widths,tops):
            center=(top+bottom)*.5;rz=(top-bottom)*.5
            for j in range(segments):
                a=j*math.tau/segments;vs.append((x+w*math.cos(a),y,center+rz*math.sin(a)))
        for i in range(len(ys)-1):
            for j in range(segments):a=i*segments+j;b=i*segments+(j+1)%segments;faces.append((a,b,b+segments,a+segments))
        faces.append(tuple(range(segments-1,-1,-1)));faces.append(tuple((len(ys)-1)*segments+j for j in range(segments)))
        obj=mesh(name,vs,faces,mat,'foot'+side);recalc(obj);subdivide(obj,1);return obj
    ys=[-.225,-.212,-.187,-.135,-.065,.005,.065,.086,.092]
    widths=[.009,.036,.054,.061,.053,.044,.038,.025,.008]
    shoe_loft('Court outsole'+side,ys,widths,[.062]*len(ys),.028,sole)
    ysupper=[-.220,-.205,-.180,-.130,-.065,-.010,.040,.075,.083]
    upperwidths=[.008,.034,.052,.056,.048,.040,.039,.025,.009]
    shoe_loft('Court sneaker'+side,ysupper,upperwidths,[.064,.077,.084,.100,.125,.147,.147,.112,.087],.055,white)
    sphere('Shoe tongue'+side,(x,-.028,.141),(.026,.043,.011),shirtmat,'foot'+side,16,10)
    for j in range(5):
        y=-.079+j*.015;z=.119+j*.005
        tube('Court lace'+side,[(x-.024,y,z),(x,y-.004,z+.009),(x+.024,y,z)],.0017,white,'foot'+side,1)
    for direction in [-1,1]:
        tube('Court shoe side seam'+side,[(x+direction*.045,.037,.096),(x+direction*.049,-.038,.101),(x+direction*.054,-.105,.086),(x+direction*.047,-.165,.076)],.0017,accent,'foot'+side,1)
    tube('Heel pull'+side,[(x-.012,.068,.118),(x,.078,.150),(x+.012,.068,.118)],.002,accent,'foot'+side,1)

# ---- hair: a shell over the scalp carrying the photographed short hair -------
# public/assets/textures/hair.png lies over the head's UV island (strand detail
# and coverage). The shell is the scalp itself, cut to where that hair grows and
# lifted a few millimetres off the skin; the shader alpha-tests it, so the
# hairline is the photograph's own and the game picks the cut (fade, crop).
HAIR_LIFT,HAIR_FUZZ=.0032,.0026
hairimage=bpy.data.images.load(str(ROOT/'public'/'assets'/'textures'/'hair.png'))
HW,HH=hairimage.size;_px=np.zeros(HW*HH*4,dtype=np.float32);hairimage.pixels.foreach_get(_px)
coverage=_px.reshape(HH,HW,4)[:,:,3]          # (row 0 is the bottom of the image, v = 0)
def hair_at(uv,reach=3):
    if uv[0]<1.:return 0.
    x=int(round((uv[0]-1.)*(HW-1)));y=int(round(uv[1]*(HH-1)))
    return float(coverage[max(0,y-reach):y+reach+1,max(0,x-reach):x+reach+1].max(initial=0.))
cap=source_mesh('HairCap',[f for f in groups['body'] if any(hair_at(uvs[u])>.04 for i,u in f)],hair)
for v in cap.data.vertices:v.co+=v.normal*HAIR_LIFT
cap.data.update();subdivide(cap,1)
bpy.data.images.remove(hairimage)
# A second, sparser shell further out: only the curls' tips reach it, so the
# hair has a soft, broken silhouette instead of a painted cap's hard edge. Its
# UVs sit one unit further right (u in [2, 3]) so the shader can tell it apart.
fuzz=cap.copy();fuzz.data=cap.data.copy();fuzz.name='HairFuzz';fuzz.data.name='HairFuzz';bpy.context.collection.objects.link(fuzz)
for v in fuzz.data.vertices:v.co+=v.normal*HAIR_FUZZ
for loop in fuzz.data.uv_layers['UVMap'].data:loop.uv=(loop.uv[0]+1.,loop.uv[1])
fuzz.data.update()

def merge(pieces,name):
    if not pieces:return
    active(pieces[0])
    for o in pieces:o.select_set(True)
    bpy.ops.object.join();o=bpy.context.object;o.name=name;o.data.name=name
    # Only one skinning modifier is retained by join; all pieces share the same rig.
    o.select_set(False);return o

# One material batch per accessory family keeps gameplay draw calls modest.
protected=[body,tee,pants,cap,fuzz]
for mat in [white,sole,accent,shirtmat]:
    pieces=[o for o in list(bpy.context.scene.objects) if o.type=='MESH' and o not in protected and len(o.data.materials)==1 and o.data.materials[0]==mat]
    merge(pieces,'Details_'+mat.name)
for o in bpy.context.scene.objects:
    if o.type=='MESH':
        o.data.name=o.name
        for poly in o.data.polygons:poly.use_smooth=True
# Athletic silhouettes are sculpted around the retained rest bones. Contact reach,
# grip origins and the rig contract remain identical; only the visible volumes change.
limb_ends={}
for side in ['.L','.R']:
    for start,end in [('arm','forearm'),('forearm','hand'),('thigh','shin'),('shin','foot')]:
        limb_ends[start+side]=positions[end+side]
def athletic_volume(p,ww):
    result=Vector();total=0.
    for name,w in ww.items():
        if w<.001:continue
        q=p.copy()
        if name in limb_ends:
            a=positions[name];axis=limb_ends[name]-a;length=axis.length;axis.normalize()
            along=(p-a).dot(axis);t=max(0.,min(1.,along/length))
            radial=p-a-axis*along
            if name.startswith('arm'):factor=1.02+.10*math.sin(math.pi*t)
            elif name.startswith('forearm'):factor=1.02+.08*math.sin(math.pi*t)
            elif name.startswith('thigh'):factor=1.04+.10*math.sin(math.pi*t)
            else:factor=1.02+.10*math.sin(math.pi*t)**1.4
            q=a+axis*along+radial*factor
        elif name in ['hips','spine']:
            # Broad soft torso/seat rather than a pinched mannequin waist.
            anchor=positions[name];mask=max(0.,min(1.,(1.49-p.z)/.10))
            q.x*=1.+(.045 if name=='hips' else .07)*mask
            q.y=anchor.y+(p.y-anchor.y)*(1.+.055*mask)
        elif name.startswith('foot'):
            # Court shoes have a wide stable base and a proper toe box.
            anchor=positions[name];q.x=anchor.x+(p.x-anchor.x)*1.08
            q.y=anchor.y+(p.y-anchor.y)*1.05
        result+=q*w;total+=w
    return result/total if total else p
for obj in bpy.context.scene.objects:
    if obj.type!='MESH':continue
    boneweights=[]
    for vertex in obj.data.vertices:
        boneweights.append({obj.vertex_groups[a.group].name:a.weight for a in vertex.groups if obj.vertex_groups[a.group].name in positions})
    if obj.data.shape_keys:
        for key in obj.data.shape_keys.key_blocks:
            for i,point in enumerate(key.data):point.co=athletic_volume(point.co,boneweights[i])
        for i,v in enumerate(obj.data.vertices):v.co=obj.data.shape_keys.key_blocks['Basis'].data[i].co
    else:
        for i,v in enumerate(obj.data.vertices):v.co=athletic_volume(v.co,boneweights[i])
    obj.data.update()
# Fit the authored short shell against the final athletic thigh volume. Helper
# weights and anatomical weights differ near the leg openings; without this
# clearance pass a narrow strip of skin protruded through the live shorts hem.
skin_bvh=BVHTree.FromPolygons([v.co for v in body.data.vertices],
                             [list(p.vertices) for p in body.data.polygons])
for vertex in pants.data.vertices:
    hit,normal,_,distance=skin_bvh.find_nearest(vertex.co)
    if hit is not None and distance<.070:
        clearance=(vertex.co-hit).dot(normal)
        if clearance<.013:vertex.co+=normal*(.013-clearance)
pants.data.update()
# The colored inset is fitted to the finished cloth shell rather than floating
# above a separately smoothed helper, which could leave little black gaps.
short_bvh=BVHTree.FromPolygons([v.co for v in pants.data.vertices],
                              [list(p.vertices) for p in pants.data.polygons])
accent_details=bpy.data.objects.get('Details_Accent')
if accent_details:
    for vertex in accent_details.data.vertices:
        if not .776<vertex.co.z<1.108:continue
        hit,normal,_,distance=short_bvh.find_nearest(vertex.co)
        if hit is not None and distance<.070:vertex.co=hit+normal*.003
    accent_details.data.update()
# The converter removes this legacy interchange scale to restore adult anatomy.
head_anchor=positions['head'].copy()
def playful_head(p,weight=1.):
    p=p.copy()  # Retain anatomical jaw, cheek planes and adult eye proportions.
    t=max(0.,min(1.,(p.z-1.49)/.10));t=t*t*(3.-2.*t)*weight
    delta=p-head_anchor
    return head_anchor+Vector((delta.x*(1.+.93*t),delta.y*(1.+.57*t),delta.z*(1.+.65*t)))
for obj in bpy.context.scene.objects:
    if obj.type!='MESH':continue
    vg=obj.vertex_groups.get('head')
    if vg is None:continue
    headweights=[]
    for v in obj.data.vertices:
        w=next((assignment.weight for assignment in v.groups if assignment.group==vg.index),0.)
        headweights.append(w)
    if obj.data.shape_keys:
        for key in obj.data.shape_keys.key_blocks:
            for i,point in enumerate(key.data):
                if headweights[i]>.001:point.co=playful_head(point.co,headweights[i])
        for i,v in enumerate(obj.data.vertices):v.co=obj.data.shape_keys.key_blocks['Basis'].data[i].co
    else:
        for i,v in enumerate(obj.data.vertices):
            if headweights[i]>.001:v.co=playful_head(v.co,headweights[i])
    obj.data.update()
# Machine-readable landmarks keep the creator cameras, frames and attachments aligned.
def godot(p):return [round(p.x,6),round(p.z,6),round(-p.y,6)]
eye_center=playful_head(Vector((joint('eye.L').x,-.1557,1.6487)))
landmarks={'head_bone_global':godot(head_anchor),'eye_center_L_global':godot(eye_center),'eye_center_R_global':godot(Vector((-eye_center.x,eye_center.y,eye_center.z))),'eye_radius_horizontal':.039,'head_top':round(max(v.co.z for o in bpy.context.scene.objects if o.type=='MESH' and o.name.startswith('Hair') for v in o.data.vertices),6),'glasses_center_L_local':[round(eye_center.x,6),round(eye_center.z-head_anchor.z,6),round(-eye_center.y+head_anchor.y+.016,6)],'glasses_lens_radius':.0375,'brow_height_global':round(playful_head(Vector((0,-.15,1.675))).z,6),'style':'Adult athletic anatomy, neutral facial proportions and original basketball kit'}
(OUT/'Athlete.landmarks.json').write_text(json.dumps(landmarks,indent=2)+'\n')
# Preserve a separate animated support-hand grip for two-handed backhands.
import importlib.util
support_spec = importlib.util.spec_from_file_location('support_grip', str(Path(__file__).with_name('add_support_grip.py')))
support_module = importlib.util.module_from_spec(support_spec)
support_spec.loader.exec_module(support_module)
support_module.add_support_grip(body)
for shape in HAND_SHAPES:support_module.mirror_hand_key(body,shape,shape+'L')
# The export contains baked geometry, a 15-bone identity-axis rig and real morphs.
bpy.ops.object.select_all(action='DESELECT')
for o in bpy.context.scene.objects:o.select_set(True)
# Working source is regenerated; only compact basketball runtime assets are distributed.
bpy.ops.export_scene.gltf(filepath=str(OUT/'Athlete.glb'),export_format='GLB',export_apply=False,export_animations=False,export_skins=True,export_morph=True)
print('Crotch height',round(CROTCH,3))
print('Athlete exported:',len(body.data.vertices),'visible skin vertices;',len(positions),'deform bones')
if '--preview' in sys.argv:
    # CPU proof render is available without claiming the team's display server.
    world=bpy.data.worlds.new('Studio');bpy.context.scene.world=world;world.use_nodes=True
    world.node_tree.nodes['Background'].inputs[0].default_value=(.13,.17,.20,1);world.node_tree.nodes['Background'].inputs[1].default_value=.65
    for loc,energy,size in [((-3,-4,5),500,5),((3,-1,3),220,3),((0,3,4),600,3)]:
        bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=energy;o.data.shape='DISK';o.data.size=size;o.rotation_euler=(Vector((0,0,1.15))-o.location).to_track_quat('-Z','Y').to_euler()
    bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,.019));floor=bpy.context.object;floor.data.materials.append(material('Studio floor',(.20,.26,.28),.86))
    bpy.ops.object.camera_add(location=(.85,-3.5,1.65));camera=bpy.context.object;camera.rotation_euler=(Vector((0,-.02,.99))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=2.10
    sc=bpy.context.scene;sc.camera=camera;sc.render.engine='CYCLES';sc.cycles.samples=32;sc.cycles.use_denoising=False;sc.render.resolution_x=900;sc.render.resolution_y=1100;sc.render.resolution_percentage=100;sc.view_settings.view_transform='Standard';sc.render.filepath='/tmp/athlete-rebuilt-neutral.png';bpy.ops.render.render(write_still=True)
    camera.location=(.09,-1.5,1.78);camera.rotation_euler=(Vector((0,-.04,1.73))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=.52;sc.render.resolution_x=900;sc.render.resolution_y=900;sc.render.filepath='/tmp/athlete-rebuilt-face.png';bpy.ops.render.render(write_still=True)
