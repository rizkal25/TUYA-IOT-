import requests

# alamat home assistant
HA_URL = "http://172.25.1.8:8123"

# token dari home assistant
TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiIxMzgxZmUzNjQxY2U0YmZlODRjOTQ5OTQ3ZTdlMmVhYyIsImlhdCI6MTc3OTMyNTY5NywiZXhwIjoyMDk0Njg1Njk3fQ.aboxoeK6o57CpDGCeOvMjdgonOqE-_gWnmpQR9TL5d0"

headers = {
    "Authorization": f"Bearer {TOKEN}",
    "content-type": "application/json",
}

def get_sensor(entity_id):
    url = f"{HA_URL}/api/states/{entity_id}"
    response = requests.get(url, headers=headers)
    
    if response.status_code == 200:
        data = response.json()
        return data["state"]
    else:
        return None

current = get_sensor("sensor.wifi_smart_meter_current")
power = get_sensor("sensor.wifi_smart_meter_power")
voltage = get_sensor("sensor.wifi_smart_meter_tegangan")

print("Current  :", current, "A")
print("Power    :", power, "W")
print("Voltage  :", voltage, "V")