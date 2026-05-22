import pytest
from pruefung.db import SupabaseClient


def test_init_requires_envs(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    with pytest.raises(RuntimeError):
        SupabaseClient.from_env()


def test_init_with_envs(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "http://x")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "k")
    c = SupabaseClient.from_env()
    assert c.url == "http://x"
    assert c.key == "k"


def test_strips_trailing_slash():
    c = SupabaseClient("http://x/", "k")
    assert c.url == "http://x"
