import requests
import json

URL = "http://localhost:8000"

# 1. Login to get admin token
res = requests.post(f"{URL}/api/auth/login", json={"username": "admin", "password": "admin123"})
# the new middleware requires CSRF. Wait, requests.post needs CSRF token now!
