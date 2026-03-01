# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec for Nearu Sense orchestrator
# Build: pyinstaller nearu-orchestrator.spec

import sys
from pathlib import Path
from PyInstaller.utils.hooks import collect_all, collect_submodules, collect_data_files

block_cipher = None
here = Path(SPECPATH)

# Cross-platform venv site-packages discovery
_candidates = [here / '.venv' / 'Lib' / 'site-packages']  # Windows
_lib_dir = here / '.venv' / 'lib'
if _lib_dir.exists():
    _candidates += sorted(_lib_dir.glob('python*/site-packages'))  # macOS/Linux

venv_sp = None
for candidate in _candidates:
    if candidate.exists():
        venv_sp = candidate
        break

if venv_sp is None:
    raise SystemExit(
        "Venv site-packages not found. "
        "Run: python -m venv .venv && pip install -r requirements.txt"
    )

sys.path.insert(0, str(venv_sp))

cv2_datas, cv2_bins, cv2_hidden = collect_all('cv2')
onnx_datas, onnx_bins, onnx_hidden = collect_all('onnxruntime')
hsemo_datas, hsemo_bins, hsemo_hidden = collect_all('hsemotion_onnx')
gai_datas, gai_bins, gai_hidden = collect_all('google.generativeai')
proto_datas, proto_bins, proto_hidden = collect_all('google.protobuf')
grpc_hidden = collect_submodules('grpc')
openai_datas = collect_data_files('openai')
pil_datas, pil_bins, pil_hidden = collect_all('PIL')
certifi_datas = collect_data_files('certifi')
anyio_hidden = collect_submodules('anyio')

a = Analysis(
    [str(here / 'main.py')],
    pathex=[str(here), str(venv_sp)],
    binaries=cv2_bins + onnx_bins + hsemo_bins + gai_bins + proto_bins + pil_bins,
    datas=[
        (str(here / 'api'), 'api'),
        (str(here / 'services'), 'services'),
        (str(here / 'models'), 'models'),
        (str(here / 'utils'), 'utils'),
    ] + cv2_datas + onnx_datas + hsemo_datas + gai_datas + proto_datas + openai_datas + pil_datas + certifi_datas,
    hiddenimports=[
        # FastAPI / Uvicorn
        'uvicorn',
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        'fastapi',
        'starlette',
        'starlette.routing',
        'starlette.middleware',
        'starlette.middleware.cors',
        # WebSocket
        'websockets',
        # Misc
        'numpy',
        'aiosqlite',
        'openai',
        'dotenv',
        'email_validator',
        'httpcore',
        'httpx',
        'h11',
        'sniffio',
        'pydantic',
        'pydantic.deprecated',
        'pydantic.deprecated.decorator',
        'certifi',
    ] + cv2_hidden + onnx_hidden + hsemo_hidden + gai_hidden + proto_hidden
      + grpc_hidden + pil_hidden + anyio_hidden,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'tkinter',
        'matplotlib',
        'scipy',
        'pandas',
        'IPython',
        'jupyter',
        'notebook',
        'pytest',
        'torch',
        'transformers',
        'speechbrain',
        'torchaudio',
    ],
    noarchive=False,
    cipher=block_cipher,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='nearu-orchestrator',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='nearu-orchestrator',
)
