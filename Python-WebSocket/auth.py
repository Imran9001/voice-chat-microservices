import requests
import os

JAVA_AUTH_URL = os.getenv("JAVA_AUTH_URL", "http://localhost:8080/auth/verify")

def verify_jwt(token: str):
    print("Verifying token:", token[:50] + "...")  # short preview
    try:
        response = requests.post(JAVA_AUTH_URL, json={"token": token})
        print(" Response status:", response.status_code)
        print(" Response body:", response.text)
    except Exception as e:
        print(" Could not reach Java server:", e)
        raise

    if response.status_code == 200:
        data = response.json()
        if data.get("valid"):
            return data
    raise Exception("Invalid token")
