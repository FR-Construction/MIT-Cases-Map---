import smartsheet
TOKEN = "v6mG3HaOMr1VjYDdTAdvSyIUmTOK2F3SlBBiV"
client = smartsheet.Smartsheet(TOKEN)
sheet = client.Sheets.get_sheet(9006720391008132)
with open("cols.txt", "w") as f:
    for col in sheet.columns:
        f.write(col.title + "\n")
