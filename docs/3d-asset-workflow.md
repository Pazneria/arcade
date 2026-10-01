# 3D Asset Workflow

When this arcade asks for 3D models or assets, the default expectation is an AI-generated 3D source asset followed by local cleanup and runtime integration. Primitive mesh blockouts are only for explicit temporary blocking.

## Default Workflow

1. Write a clean object prompt and concept image.
2. Generate the base mesh with an image-to-3D model.
3. Save the raw generated GLB as source provenance.
4. Clean the model locally: assign readable materials, normalize scale and orientation, set a useful pivot, and reduce runtime cost.
5. Promote a cleaned `.glb` or `.gltf` into `assets/3d/runtime/`.
6. Render future icons or previews from the cleaned 3D asset when possible.

## Preferred Generator

```text
tencent/Hunyuan3D-2/hunyuan3d-dit-v2-0
```

The generator calls the hosted Hunyuan3D Space. Create and activate a Python virtual environment first:

Windows PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

macOS/Linux:

```sh
python3 -m venv .venv
. .venv/bin/activate
```

Then, on either platform:

```sh
python -m pip install gradio_client pillow
npm run asset:generate-cabinet
npm run asset:clean-cabinet
```

Alternatively, place an externally generated GLB at `assets/3d/source/classic-cabinet-depth-prototype/raw.glb` and run `npm run asset:clean-cabinet`. Use `npm run asset:promote-cabinet` only to copy the raw model unchanged for visual review; it overwrites the cleaned runtime asset.

## Folder Contract

```text
assets/3d/source/<asset-name>/
  prompt.md
  concept.png
  raw.glb
  source.json

assets/3d/runtime/
  <asset-name>.glb

assets/3d/previews/
  <asset-name>.png
```

The `source` folder is provenance. The `runtime` folder is what the arcade loads.

## Runtime Checklist

- Stable asset id and path
- GLB v2 validates before integration
- Pivot centered at the floor/base for cabinet placement
- Front direction documented
- Scale matches the existing cabinet aisle
- Material regions are readable in the dark arcade scene
- Mesh cost is acceptable for browser runtime
- The sixth arcade slot loads the runtime GLB without replacing existing cabinets

