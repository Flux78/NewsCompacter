import os
import pytest
from services.crypto import encrypt, decrypt, is_encrypted


class TestCrypto:
    def test_encrypt_decrypt_roundtrip(self):
        plain = "sk-or-test-key-12345"
        encrypted = encrypt(plain)
        assert encrypted != plain
        assert is_encrypted(encrypted)
        assert decrypt(encrypted) == plain

    def test_empty_string(self):
        assert encrypt("") == ""
        assert decrypt("") == ""

    def test_not_encrypted_detection(self):
        assert not is_encrypted("plaintext-key")
        assert not is_encrypted("")

    def test_old_plaintext_falls_through(self):
        assert decrypt("old-plaintext") == "old-plaintext"
