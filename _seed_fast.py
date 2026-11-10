"""Charge le jeu de données de démonstration modeste (pas de milliers de lignes)."""
import os
import django

os.environ.setdefault("PYTHONUNBUFFERED", "1")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.core.management import call_command

call_command("seed_demo", reset=True)
