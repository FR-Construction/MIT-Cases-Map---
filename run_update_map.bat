@echo off
cd /d "%~dp0"
echo Running PR Cases Map Updater...
"C:\Users\lpagan\AppData\Local\Programs\Python\Python312\python.exe" update_map_data.py
echo Done.
