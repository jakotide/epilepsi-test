# Watercolor still life

The migraine experience shows the original ceramic mug with a shallow celadon
plate and a lavender linen-bound book. All objects use the same Eevee watercolor
material, with layered pigment, paper grain, and shared window lighting.

`watercolor-still-life.blend` contains the wide composition. `mug-close/` and
`open-book/` each contain an independent editable Blender scene and a preview.
The close view uses a lower camera and tighter framing, with the mug in front.
The open-book view uses a higher camera, curved pages with tiny graphite
scribbles, and the mug and plate behind the book. All previews use the site's
`#f3f1f7` paper color. Original sources and rose/woodland website code are retained.

Each composition has 72 transparent 960px WebP views at five-degree intervals
in `public/models/still-life/`: `orbit/`, `mug-close/`, and `open-book/`.
The orbit cache keeps at most six textures per composition, plus in-flight
decodes. During a transition only the current and incoming compositions are
retained; the outgoing cache is disposed at the hidden swap. Only the nearest
frame is displayed, without crossfading neighboring views, to keep book edges
and mug handles crisp. Dragging and Left/Right rotate the whole arrangement;
Home resets the current effect's view. Automatic movement is restrained and
pauses offscreen, in hidden tabs, and with reduced motion enabled.

`STILL_LIFE_SCENES` assigns the mug close-up to Uskarpt, the original wide view
to Lyspunkter, the open book to Aura, and an angled wide view to Slør.
On selection, the exact destination frame loads before the current scene fades
to paper over 0.32 seconds. The new composition then fades in over 0.42 seconds.
Reduced motion switches directly once ready. Rapid selections cancel obsolete
loads and transitions; a failed load keeps the current composition visible.
The former “Bukett” control is labeled “Aura”. Set `SHOW_BOTANICAL_SCENES` in
`app/migrene/experienceConfig.ts` to `true` to restore the previous subjects,
labels, framing, and scene transitions. While disabled, rose and woodland assets
are not requested.

To rebuild from the repository root with Blender MCP listening on port 9876:

```powershell
node scripts/blender/send-command.cjs scripts/blender/create_watercolor_still_life.py
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' -b assets/still-life/watercolor-still-life.blend -P scripts/blender/render_still_life.py -- 0 72
node scripts/pack-still-life.cjs

node scripts/blender/send-command.cjs scripts/blender/create_still_life_variants.py
foreach ($composition in @('mug-close', 'open-book')) {
  & 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' -b "assets/still-life/$composition/watercolor-still-life.blend" -P scripts/blender/render_still_life.py -- 0 72 $composition
  node scripts/pack-still-life.cjs $composition
}
```

The builder creates a new scene and writes only its dependencies to the new
asset file. It leaves the open Blender file and existing scenes intact. Rendering
extracts cast shadows against a separate empty floor baseline. The packer
softens these into translucent pigment before adding the painted objects.
Intermediate PNG passes are reproducible and ignored by Git.
