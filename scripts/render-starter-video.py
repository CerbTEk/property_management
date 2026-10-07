"""Generate the bundled woodland loop from the repository's original starter photos."""
from pathlib import Path
import argparse
import runpy
parser=argparse.ArgumentParser()
parser.add_argument('--ffmpeg',default='ffmpeg')
args=parser.parse_args()
root=Path(__file__).resolve().parent.parent
render=runpy.run_path(str(root/'scripts/render-display-video.py'))['render']
render([root/'public/tv-scenes'/name for name in ('woodland-lake.webp','forest-path.webp','mountain-sunset.webp')],root/'public/tv-scenes/woodland-loop.mp4',10,args.ffmpeg)

