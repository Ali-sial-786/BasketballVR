"""Add the left-hand grip morph to the current editable athlete, without rebuilding its art."""
from pathlib import Path
import bpy
from mathutils import Vector
from mathutils.kdtree import KDTree

ROOT = Path(__file__).resolve().parents[1]


def add_support_grip(body):
    keys = body.data.shape_keys.key_blocks
    basis = keys['Basis']
    right = keys['HandGrip']
    left = keys.get('SupportGrip') or body.shape_key_add(name='SupportGrip',from_mix=False)
    tree = KDTree(len(basis.data))
    for i, point in enumerate(basis.data):
        tree.insert(point.co, i)
    tree.balance()
    changed = 0
    for i, point in enumerate(basis.data):
        left.data[i].co = point.co
        if point.co.x <= 0.25 or point.co.z > 1.35:
            continue
        _, index, distance = tree.find(Vector((-point.co.x, point.co.y, point.co.z)))
        if distance < 0.006:
            delta = right.data[index].co - basis.data[index].co
            left.data[i].co += Vector((-delta.x, delta.y, delta.z))
            changed += delta.length > 0.00001
    assert changed > 100, f'Expected actual finger geometry, changed {changed} vertices'
    print(f'Support-hand grip: {changed} vertices')


if __name__ == '__main__':
    bpy.ops.wm.open_mainfile(filepath=str(ROOT / 'art-sources/Courtside-Athlete.blend'))
    add_support_grip(bpy.data.objects['Athlete_Body'])
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'art-sources/Courtside-Athlete.blend'))
    bpy.ops.export_scene.gltf(filepath=str(ROOT / 'assets/models/Athlete.glb'), export_format='GLB',
                              export_apply=False, export_animations=False, export_skins=True, export_morph=True)
