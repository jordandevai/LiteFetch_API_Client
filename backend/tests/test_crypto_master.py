import os
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.core.crypto import encrypt_value, decrypt_value, KEY_LEN


def test_master_round_trip():
    master = os.urandom(KEY_LEN)
    cipher = encrypt_value("secret", master)
    assert decrypt_value(cipher, master) == "secret"


def test_legacy_round_trip():
    passphrase = "hunter2"
    cipher = encrypt_value("secret", passphrase)
    assert decrypt_value(cipher, passphrase) == "secret"
