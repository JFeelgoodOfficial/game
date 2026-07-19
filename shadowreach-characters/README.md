# Shadowreach character portraits

Drop the owner's own character artwork here and it appears in-game as a
**player-facing hologram** pinned to the front of the matching Shadowreach NPC.
From the player's viewpoint you see the real portrait; walking around the figure
reveals the 3D character standing behind it.

## How it works

`world/shadowreach.js` globs this folder at build time and matches each image to
an NPC **by filename** (case-insensitive substring). An NPC whose portrait
hasn't been committed simply stays its procedural 3D figure — nothing breaks, so
you can add portraits one at a time and each redeploys on its own.

## Filenames

Name the file after the character key. Any of `.png`, `.jpg`, `.jpeg`, `.webp`
works; **transparent-background PNG is strongly recommended** so the cutout sits
cleanly on the figure.

| File                | Character            | Where you meet them            |
| ------------------- | -------------------- | ------------------------------ |
| `lady.png`          | The Lady in White    | Seated at the river's near bank |
| `cloaked.png`       | The Cloaked Figure   | Far bank; follows you onward    |
| `girl.png`          | The Girl             | Runs in and breaks the Line     |
| `warrior.png`       | The Warrior          | The storm wasteland             |
| `stranger.png`      | The Stranger         | Seated in the garden            |

Notes:
- The **Mirror-self** in the round room stays the reflective 3D rig on purpose —
  it's meant to be *you*, not a fixed portrait.
- The **Cloaked Figure** and **Stranger** portraits hide themselves during the
  finale, so the mask-lift and dissolve beats play on the real 3D rigs.
- Aspect ratio is read from the image automatically; portraits scale to the
  configured height, so tall or wide art both work.

## Adding a portrait

1. Export a transparent PNG of the character.
2. Save it here with the matching name (e.g. `warrior.png`).
3. Commit and push. The next production deploy lights up that portrait.
