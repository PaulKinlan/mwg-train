#!/usr/bin/env python3
"""Offline, byte-pinned crops of the 30 framed A1 planning references. No network or image model calls.

`--write` reads the ORIGINAL JPEGs from SOURCE_COMMIT in local Git, crops out only observed browser/desktop
chrome, writes derived JPEGs and a source-to-output SHA ledger. `--verify` re-encodes against the pinned source
and compares the committed files and ledger. Requires Pillow 12.3.0 for reproducible encoder bytes.

The crop boxes were inspected board-by-board: most remove a variable top band; tr-05/21/25 also remove
surrounding desktop/window shadows on all sides. We deliberately do not scale, stretch, or force 16:9:
that would either distort pixels or cut headings/controls. A future image-model output is still requested
at 1376x768 by generate-training-boards.mjs; these particular checked-in images are derived crops.
"""
from __future__ import annotations

import argparse
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
import subprocess
import sys

from PIL import Image, __version__ as pillow_version

ROOT = Path(__file__).resolve().parent.parent
LEDGER = ROOT / 'docs/provenance/assets/training-frame-crops.json'
SOURCE_COMMIT = '903f3a8a003077270e4318184bbaf89a0d61690c'
PILLOW_VERSION = '12.3.0'
BOXES = {
    'tr-01': (0, 58, 1376, 768), 'tr-02': (0, 42, 1376, 768),
    'tr-03': (0, 64, 1376, 768), 'tr-04': (0, 64, 1376, 768),
    'tr-05': (43, 89, 1325, 715), 'tr-06': (0, 62, 1376, 768),
    'tr-07': (0, 71, 1376, 768), 'tr-08': (0, 64, 1376, 768),
    'tr-09': (0, 65, 1376, 768), 'tr-10': (0, 68, 1376, 768),
    'tr-11': (0, 63, 1376, 768), 'tr-12': (0, 75, 1376, 768),
    'tr-13': (0, 70, 1376, 768), 'tr-14': (0, 65, 1376, 768),
    'tr-15': (0, 73, 1376, 768), 'tr-16': (0, 59, 1376, 768),
    'tr-17': (0, 70, 1376, 768), 'tr-18': (0, 64, 1376, 768),
    'tr-19': (0, 65, 1376, 768), 'tr-20': (0, 74, 1376, 768),
    'tr-21': (37, 70, 1334, 721), 'tr-22': (0, 79, 1376, 768),
    'tr-23': (0, 71, 1376, 768), 'tr-24': (0, 78, 1376, 750),
    'tr-25': (41, 81, 1333, 717), 'tr-26': (0, 74, 1376, 768),
    'tr-27': (0, 73, 1376, 768), 'tr-28': (0, 71, 1376, 768),
    'tr-29': (0, 58, 1376, 768), 'tr-30': (0, 71, 1376, 768),
}


def digest(data: bytes) -> str:
    return sha256(data).hexdigest()


def original_board(family: str) -> bytes:
    path = f'docs/design/training/{family}/reference.jpg'
    return subprocess.run(['git', 'show', f'{SOURCE_COMMIT}:{path}'], cwd=ROOT,
                          check=True, capture_output=True).stdout


def derive(family: str, box: tuple[int, int, int, int]) -> tuple[bytes, dict]:
    source = original_board(family)
    with Image.open(BytesIO(source)) as original:
        if original.size != (1376, 768) or original.format != 'JPEG':
            raise ValueError(f'{family}: source is not a 1376x768 JPEG')
        x1, y1, x2, y2 = box
        if not (0 <= x1 < x2 <= original.width and 0 <= y1 < y2 <= original.height):
            raise ValueError(f'{family}: invalid crop box {box}')
        output = BytesIO()
        original.crop(box).save(output, format='JPEG', quality=95, subsampling=0)
    data = output.getvalue()
    return data, {
        'box': list(box), 'sourceSha256': digest(source), 'derivedSha256': digest(data),
        'derivedDimensions': [x2 - x1, y2 - y1], 'derivedBytes': len(data),
    }


def main() -> None:
    cli = argparse.ArgumentParser(description=__doc__)
    modes = cli.add_mutually_exclusive_group(required=True)
    modes.add_argument('--write', action='store_true', help='crop pinned originals and write boards + ledger')
    modes.add_argument('--verify', action='store_true', help='check committed boards + ledger against originals')
    args = cli.parse_args()
    if pillow_version != PILLOW_VERSION:
        raise SystemExit(f'Pillow {PILLOW_VERSION} required, found {pillow_version}; do not rewrite digests with another encoder')
    boards: dict[str, dict] = {}
    generated: dict[str, bytes] = {}
    for family, box in BOXES.items():
        generated[family], boards[family] = derive(family, box)
    ledger = {
        'schemaVersion': 1,
        'sourceCommit': SOURCE_COMMIT,
        'sourceDimensions': [1376, 768],
        'transform': f'Pillow {PILLOW_VERSION} JPEG quality=95 subsampling=0; crop only, no resize or inpainting',
        'boards': boards,
    }
    if args.write:
        for family, data in generated.items():
            destination = ROOT / f'docs/design/training/{family}/reference.jpg'
            temporary = destination.with_suffix('.jpg.tmp')
            temporary.write_bytes(data)
            temporary.replace(destination)
        LEDGER.write_text(json.dumps(ledger, indent=2) + '\n', encoding='utf8')
        print(f'Wrote {len(generated)} locally cropped references and {LEDGER.relative_to(ROOT)}')
        return
    if not LEDGER.exists() or json.loads(LEDGER.read_text(encoding='utf8')) != ledger:
        raise SystemExit('Frame-crop ledger disagrees with pinned source commit, crop boxes or encoder bytes')
    for family, data in generated.items():
        file = ROOT / f'docs/design/training/{family}/reference.jpg'
        if not file.is_file() or file.read_bytes() != data:
            raise SystemExit(f'{family}: committed reference differs from the pinned offline crop')
    print(f'PASS: {len(generated)} derived boards match pinned originals, explicit boxes and output SHAs')


if __name__ == '__main__':
    try:
        main()
    except (OSError, subprocess.CalledProcessError, ValueError) as error:
        raise SystemExit(str(error)) from error
