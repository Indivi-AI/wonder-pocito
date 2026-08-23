# syncer — photograph git diffs across an airgap

Carry a git diff between disconnected networks with nothing but a screen on one side and a phone camera on the other.
`diff-to-media.js` renders the diff as high-contrast bitmap pages (PNG stills + one looping GIF video); an AI on the far side
reads the photos and re-applies the diff. `diff-to-media.js` is a single self-contained node-stdlib file (embedded font, own
PNG/GIF encoders) — get it into the airgapped side once, by any channel you already have.

## inner side (has the diff)

    node syncer/diff-to-media.js                    # git diff HEAD (all uncommitted work)
    node syncer/diff-to-media.js master..HEAD       # any git diff args pass through
    node syncer/diff-to-media.js - < some.patch     # or pipe a ready-made patch

Outputs in `syncer/out/`: `page-NN.png` (photograph them as stills) and `diff-sync.gif` (film it as a video).
Flags: `--cols 96 --rows 54 --scale 2 --hold 2.5 --out dir` (raise `--scale` / lower `--cols` if the phone must film from far).

## filming the video

Open `diff-sync.gif` fullscreen (any browser, 100% zoom). It loops forever: **magenta flash = cycle start**, pages are
separated by **green flashes**, each page holds ~2.5s. Phone: highest video resolution, fill the frame with the screen,
tap to focus, start anytime, stop after the magenta flash has appeared **twice**.

## outer side (applies the diff)

    node syncer/video-to-pages.js phone-video.mp4

Needs one `ffmpeg` binary (see dependencies below). It classifies sampled frames by mean color,
takes the content segments between two magenta markers, and saves the middle frame of each at full resolution as
`syncer/out-pages/page-NN.png` — deterministic thresholds, no OCR, no ML. Photographed stills skip this step entirely.

## let the AI re-apply

Give the AI the page images plus this prompt:

> These photos are pages of one unified git diff; each header reads "AIRGAP pX/N crc=...". Check pages 1..N are all present.
> Transcribe exactly: a line starting with "~" continues the previous line (join them, dropping the "~"); "\t" is a real tab,
> "\\" a literal backslash, "\uXXXX" / "\u{...}" that unicode char. Page 1 opens with 2 meta lines (branch, base commit,
> rules) that are not diff content. Reconstruct the patch and apply it to the current branch (verify it sits on the base
> commit from the meta line). If any spot is unreadable, say so and stop — never guess code.

## dependencies & offline kit

| piece | needs | why |
| --- | --- | --- |
| `diff-to-media.js` | node + git only | font, png and gif encoders are embedded — zero packages |
| `video-to-pages.js` | node + one ffmpeg binary | decoding phone h264/hevc video is the one thing node stdlib cannot do |
| the reading AI | nothing | it just looks at `page-NN.png` |

`video-to-pages.js` finds ffmpeg in this order: `FFMPEG` env var → `ffmpeg` file beside the script (offline kit) → system
PATH → npm `ffmpeg-static` → pip `imageio-ffmpeg`. So inside the air gap any ONE of these makes it work:

- `pip install imageio-ffmpeg` from the artifactory pypi mirror — **preferred**: its manylinux wheel embeds a static
  ffmpeg, so the mirror alone is enough, no postinstall downloads
- `npm i ffmpeg-static` from the artifactory npm mirror — works only if its github-release postinstall download is
  also mirrored/allowed, which airgapped npm mirrors often are not
- system ffmpeg, if the machine already has it
- the offline kit: outside run `bash syncer/make-offline-kit.sh` (→ `syncer/syncer-kit.tar.gz` + `.sha256`, ~30MB;
  ffmpeg taken from the versioned pypi imageio-ffmpeg wheel; `ARCH=aarch64` for arm, `FFMPEG_BIN=/path` to vendor your
  own). Transfer both files, `sha256sum -c syncer-kit.tar.gz.sha256`, then `tar -xzf syncer-kit.tar.gz -C /path/to/wonder`
  — it drops `syncer/ffmpeg` next to the scripts (plus the scripts themselves, so the kit alone bootstraps a bare machine)

## notes

- binary file changes are not carried (`git diff` has no readable payload for them)
- direction-agnostic: works inner→outer and outer→inner alike
- each page header carries a crc32 of its own text, so a transcription can be machine-verified later if ever needed
