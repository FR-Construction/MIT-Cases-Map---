@echo off
cd /d "%~dp0"
echo Running PR Cases Map Updater...
python update_map_data.py
echo Done.
