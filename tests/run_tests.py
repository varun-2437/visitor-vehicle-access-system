#!/usr/bin/env python3
"""
Automated Test Runner & Service Diagnostic Checker for Visitor Vehicle Access System.
Run from project root: python3 tests/run_tests.py
"""

import sys
import time
import json
import urllib.request
import urllib.error

BACKEND_URL = "http://localhost:8000"
FRONTEND_URL = "http://localhost:5173"

class Colors:
    GREEN = "\033[92m"
    RED = "\033[91m"
    YELLOW = "\033[93m"
    BLUE = "\033[94m"
    BOLD = "\033[1m"
    END = "\033[0m"

def http_request(url, method="GET", headers=None, body=None):
    if headers is None:
        headers = {}
    if body is not None and isinstance(body, dict):
        body = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    start_time = time.time()
    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            latency_ms = int((time.time() - start_time) * 1000)
            data = response.read().decode("utf-8")
            json_data = json.loads(data) if data and data.startswith(("{", "[")) else data
            return True, response.status, json_data, latency_ms
    except urllib.error.HTTPError as e:
        latency_ms = int((time.time() - start_time) * 1000)
        data = e.read().decode("utf-8")
        json_data = json.loads(data) if data and data.startswith(("{", "[")) else data
        return False, e.code, json_data, latency_ms
    except Exception as e:
        latency_ms = int((time.time() - start_time) * 1000)
        return False, 0, str(e), latency_ms

def check_infrastructure_health():
    print(f"\n{Colors.BOLD}======================================================={Colors.END}")
    print(f"{Colors.BOLD} 📡 INFRASTRUCTURE & SERVICE HEALTH CHECK{Colors.END}")
    print(f"{Colors.BOLD}======================================================={Colors.END}")

    services = [
        ("FastAPI Backend Server", f"{BACKEND_URL}/docs"),
        ("Vite Frontend Server", FRONTEND_URL),
        ("Static QR Asset Dir", f"{BACKEND_URL}/qr_codes/"),
    ]

    healthy = True
    for name, url in services:
        success, status, data, latency = http_request(url)
        if success or status == 404 or status == 405 or "Vite" in str(data):
            print(f"  🟢 {name:<26} [ONLINE]  Latency: {latency}ms ({url})")
        else:
            healthy = False
            print(f"  🔴 {name:<26} [{Colors.RED}OFFLINE{Colors.END}] Error: Status {status} ({data})")

    return healthy

def run_automated_tests():
    print(f"\n{Colors.BOLD}======================================================={Colors.END}")
    print(f"{Colors.BOLD} 🚀 EXECUTING AUTOMATED COMPONENT TEST SUITE{Colors.END}")
    print(f"{Colors.BOLD}======================================================={Colors.END}")

    admin_token = None
    test_pass_token = None
    created_user_id = None

    tests_run = 0
    tests_passed = 0

    def assert_test(name, success, details=""):
        nonlocal tests_run, tests_passed
        tests_run += 1
        if success:
            tests_passed += 1
            print(f"  {Colors.GREEN}✔ PASS{Colors.END} | {name:<45} {details}")
        else:
            print(f"  {Colors.RED}✘ FAIL{Colors.END} | {name:<45} {details}")

    # 1. Admin Login
    success, status, data, latency = http_request(
        f"{BACKEND_URL}/api/auth/login",
        method="POST",
        body={"username": "admin", "password": "admin123"}
    )
    if success and isinstance(data, dict) and "access_token" in data:
        admin_token = data["access_token"]
        assert_test("Default Admin Authentication", True, f"({latency}ms) Token received")
    else:
        assert_test("Default Admin Authentication", False, f"HTTP {status}: {data}")

    headers = {"Authorization": f"Bearer {admin_token}"} if admin_token else {}

    # 2. User Profile (/me)
    if admin_token:
        success, status, data, latency = http_request(f"{BACKEND_URL}/api/auth/me", headers=headers)
        assert_test("JWT Token Verification (/api/auth/me)", success and data.get("username") == "admin", f"({latency}ms)")

    # 3. User Signup
    rand_num = int(time.time()) % 10000
    signup_body = {
        "username": f"pytest_user_{rand_num}",
        "email": f"pytest_{rand_num}@example.com",
        "password": "password123",
        "full_name": "CLI Test User",
        "role": "resident",
        "flat_number": "T-100"
    }
    success, status, data, latency = http_request(f"{BACKEND_URL}/api/auth/signup", method="POST", body=signup_body)
    if success and isinstance(data, dict):
        created_user_id = data.get("id")
        assert_test("Resident Account Self-Signup", True, f"User ID {created_user_id}")
    else:
        assert_test("Resident Account Self-Signup", False, f"HTTP {status}")

    # 4. Generate Pass
    if admin_token:
        pass_body = {
            "visitor_name": "CLI Test Visitor",
            "vehicle_number": f"PY{rand_num}",
            "purpose": "Automated CLI Pass Test",
            "hours_valid": 24
        }
        success, status, data, latency = http_request(f"{BACKEND_URL}/api/qr/generate", method="POST", headers=headers, body=pass_body)
        if success and isinstance(data, dict):
            test_pass_token = data.get("qr_token")
            assert_test("Visitor Pass Generation & QR Creation", True, f"Token: {test_pass_token[:8]}...")
        else:
            assert_test("Visitor Pass Generation & QR Creation", False, f"HTTP {status}")

    # 5. Gate Entry Verification
    if admin_token and test_pass_token:
        entry_body = {"qr_token": test_pass_token, "action": "entry"}
        success, status, data, latency = http_request(f"{BACKEND_URL}/api/qr/verify", method="POST", headers=headers, body=entry_body)
        assert_test("Gate Entry Scan (not_inside -> in_campus)", success, f"({latency}ms)")

    # 6. Duplicate Entry Block Check
    if admin_token and test_pass_token:
        entry_body = {"qr_token": test_pass_token, "action": "entry"}
        success, status, data, latency = http_request(f"{BACKEND_URL}/api/qr/verify", method="POST", headers=headers, body=entry_body)
        is_blocked = success and isinstance(data, dict) and data.get("valid") is False
        assert_test("Duplicate Entry Rejection Rule", is_blocked, f"Blocked: '{data.get('message', '') if isinstance(data, dict) else ''}'")

    # 7. Gate Exit Verification
    if admin_token and test_pass_token:
        exit_body = {"qr_token": test_pass_token, "action": "exit"}
        success, status, data, latency = http_request(f"{BACKEND_URL}/api/qr/verify", method="POST", headers=headers, body=exit_body)
        assert_test("Gate Exit Scan (in_campus -> exited)", success, f"({latency}ms)")

    # 8. Guard Today's Passes Feed
    if admin_token:
        success, status, data, latency = http_request(f"{BACKEND_URL}/api/qr/today-passes", headers=headers)
        assert_test("Guard Terminal Passes Feed", success and isinstance(data, list), f"Retrieved {len(data) if isinstance(data, list) else 0} items")

    # 9. Manual Vehicle Entry
    if admin_token:
        manual_body = {
            "vehicle_number": f"MN{rand_num}",
            "visitor_name": "Manual Walk-in Visitor",
            "flat_number": "C-303",
            "purpose": "Walk-in Guest",
            "action": "entry"
        }
        success, status, data, latency = http_request(f"{BACKEND_URL}/api/qr/manual-entry", method="POST", headers=headers, body=manual_body)
        assert_test("Manual Vehicle Entry Logging", success, f"({latency}ms)")

    # 10. Admin List Users
    if admin_token:
        success, status, data, latency = http_request(f"{BACKEND_URL}/api/admin/users", headers=headers)
        assert_test("Admin System User Directory Audit", success and isinstance(data, list), f"Retrieved {len(data) if isinstance(data, list) else 0} users")

    # 11. Admin User Approval
    if admin_token and created_user_id:
        success, status, data, latency = http_request(f"{BACKEND_URL}/api/admin/users/{created_user_id}/approve", method="PUT", headers=headers)
        assert_test("Admin User Account Approval", success, f"Approved ID {created_user_id}")

    # 12. Admin Access Logs Audit
    if admin_token:
        success, status, data, latency = http_request(f"{BACKEND_URL}/api/admin/logs", headers=headers)
        assert_test("Admin System Access Audit Logs", success and isinstance(data, list), f"Retrieved {len(data) if isinstance(data, list) else 0} log entries")

    print(f"\n{Colors.BOLD}-------------------------------------------------------{Colors.END}")
    if tests_passed == tests_run:
        print(f" {Colors.GREEN}{Colors.BOLD}🎉 ALL {tests_passed}/{tests_run} AUTOMATED COMPONENT TESTS PASSED CLEANLY!{Colors.END}")
    else:
        print(f" {Colors.YELLOW}{Colors.BOLD}⚠️ COMPLETED: {tests_passed}/{tests_run} Passed ({tests_run - tests_passed} Failed){Colors.END}")
    print(f"{Colors.BOLD}-------------------------------------------------------{Colors.END}\n")

if __name__ == "__main__":
    check_infrastructure_health()
    run_automated_tests()
