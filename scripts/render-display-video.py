"""Encode privately downloaded photos into an LG-compatible, silent MP4 loop."""
import argparse
import json
import subprocess
import tempfile
from pathlib import Path
from PIL import Image, ImageOps

Image.MAX_IMAGE_PIXELS = 30_000_000

def render(paths, output, seconds=20, ffmpeg='ffmpeg'):
    if not 1 <= len(paths) <= 12 or seconds not in (10, 20, 30, 60):
        raise ValueError('Invalid slideshow settings')
    with tempfile.TemporaryDirectory() as directory:
        normalized = []
        for i, path in enumerate(paths):
            with Image.open(path) as photo:
                if photo.width * photo.height > Image.MAX_IMAGE_PIXELS:
                    raise ValueError('Photo dimensions are too large')
                photo = ImageOps.exif_transpose(photo).convert('RGB')
                photo = ImageOps.fit(photo, (1280, 720), method=Image.Resampling.LANCZOS)
                target = Path(directory) / f'{i}.png'
                photo.save(target)
                normalized.append(target)
        # The repeated first photo supplies a crossfade at the loop seam.
        sources = normalized + [normalized[0]] if len(paths) > 1 else normalized
        command = [ffmpeg, '-hide_banner', '-loglevel', 'error', '-y']
        for path in sources:
            command += ['-loop', '1', '-framerate', '15', '-t', str(seconds+1), '-i', str(path)]
        filters = [f'[{i}:v]fps=15,format=yuv420p,settb=1/15[v{i}]' for i in range(len(sources))]
        last = 'v0'
        for i in range(1, len(sources)):
            current = f'blend{i}'
            filters.append(f'[{last}][v{i}]xfade=transition=fade:duration=1:offset={i*seconds},fps=15[{current}]')
            last = current
        command += ['-filter_complex', ';'.join(filters), '-map', f'[{last}]',
                    '-ss', '1' if len(paths)>1 else '0', '-t', str(len(paths)*seconds),
                    '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
                    '-profile:v', 'main', '-level:v', '3.1', '-pix_fmt', 'yuv420p',
                    '-maxrate', '600k', '-bufsize', '1200k', '-r', '15',
                    '-movflags', '+faststart', '-threads', '2', str(output)]
        result = subprocess.run(command, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=900)
        if result.returncode:
            raise RuntimeError('Video encoding failed: '+result.stderr.decode(errors='replace')[-1200:])
        if not 0 < Path(output).stat().st_size <= 64 * 1024 * 1024:
            raise ValueError('Encoded video exceeds the upload limit')

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--manifest', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--ffmpeg', default='ffmpeg')
    args = parser.parse_args()
    settings = json.loads(Path(args.manifest).read_text())
    render(settings['paths'], args.output, settings.get('seconds', 20), args.ffmpeg)

