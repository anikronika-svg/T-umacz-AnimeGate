# Bundled FFmpeg

Umiesc tutaj lokalne binarium ffmpeg, aby aplikacja mogla dzialac bez systemowego PATH.

Windows (zalecane):
- ffmpeg/ffmpeg.exe

Opcjonalnie (inne platformy):
- ffmpeg/ffmpeg

Build (`electron-builder`) kopiuje caly katalog `ffmpeg` do zasobow aplikacji (`resources/ffmpeg`).
Aplikacja najpierw szuka ffmpeg w zasobach bundled, a dopiero potem w systemowym PATH.
